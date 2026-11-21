import {
  ClaimResultCore,
  DECISIVE_VERDICTS,
  type CheckRequest,
  type CheckResponse,
  type ErrorCode,
  type Evidence,
} from '@prawdowid/contracts';
import { extractUrls, type PageResult } from '@prawdowid/sources';
import {
  APICallError,
  generateText,
  isStepCount,
  Output,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import { z } from 'zod';

import type { InjectionSignal } from './injection.ts';
import { describePii, maskPii, sanitizeUrl, type PiiKind } from './pii.ts';
import { buildInstructions, IMAGE_ONLY_PROMPT, wrapPage, wrapUserText } from './prompt.ts';
import { createTools, EvidenceRegistry, type AgentSources, type ToolName } from './tools.ts';

/** Mniej kroków = krócej: cały budżet sprawdzenia to ~30 s. */
const MAX_STEPS = 5;
export const MAX_URLS = 2;
export const ARCHIVAL_AFTER_DAYS = 365;

/** Co model zwraca na końcu. Wszystkie pola wymagane: część dostawców nie wspiera pól opcjonalnych w structured output. */
const AgentOutput = z.object({
  status: z.enum(['ok', 'needs_clarification', 'out_of_scope']),
  summary: z.string().describe('1–2 zdania podsumowania (pusty, gdy status ≠ ok)'),
  message: z.string().describe('Komunikat dla użytkownika, gdy status ≠ ok (pusty, gdy ok)'),
  claims: z.array(ClaimResultCore),
  warnings: z.array(z.string()),
});
type AgentOutput = z.infer<typeof AgentOutput>;

export type VerifyDeps = AgentSources & {
  model: LanguageModel;
  /** Pobiera stronę z URL-a podanego w zgłoszeniu. Brak = URL-e nie są pobierane. */
  fetchPage?: (url: string) => Promise<PageResult>;
  now?: () => Date;
};

export type VerifyOptions = {
  checkId: string;
  abortSignal?: AbortSignal;
};

export type VerifyMetrics = {
  usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  } | null;
  toolCalls: Record<ToolName, number>;
  sourceFailures: number;
  steps: number;
  injectionSignals: InjectionSignal[];
  piiMasked: PiiKind[];
  pages: { fetched: number; failed: number };
  /** Koszt wywołań modelu w USD. Uzupełnia go wywołujący, gdy zna cennik modelu. */
  costUsd?: number;
  /** Wersja korpusu, na której wykonano sprawdzenie. Uzupełnia ją wywołujący. */
  corpusVersion?: string;
};

export function emptyMetrics(): VerifyMetrics {
  return {
    usage: null,
    toolCalls: { search_factchecks: 0, search_corpus: 0 },
    sourceFailures: 0,
    steps: 0,
    injectionSignals: [],
    piiMasked: [],
    pages: { fetched: 0, failed: 0 },
  };
}

export type VerifyResult = {
  response: CheckResponse;
  metrics: VerifyMetrics;
};

/**
 * Weryfikuje zgłoszenie: agent LLM sam wybiera narzędzia (search_factchecks, search_corpus),
 * a wynik przechodzi deterministyczny post-processing (tylko prawdziwe dowody, bez pozornych werdyktów).
 * Nigdy nie rzuca: awarie wracają jako `status: 'error'`.
 */
export async function verify(
  input: CheckRequest,
  deps: VerifyDeps,
  options: VerifyOptions,
): Promise<VerifyResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const registry = new EvidenceRegistry();
  const meta = () => ({
    checkId: options.checkId,
    createdAt: startedAt.toISOString(),
    durationMs: now().getTime() - startedAt.getTime(),
  });

  // 1. Maskowanie danych osobowych, zanim cokolwiek trafi do modelu.
  const masked = input.text
    ? maskPii(input.text, startedAt)
    : { text: undefined, found: [] as PiiKind[] };
  const preWarnings: string[] = [];
  if (masked.found.length > 0) {
    preWarnings.push(
      `Ukryliśmy dane osobowe ze zgłoszenia (${describePii(masked.found)}). Nie zostały przekazane do analizy ani zapisane.`,
    );
  }
  if (masked.text) registry.noteInjection('user', masked.text);

  // 2. Strony z URL-i w zgłoszeniu: materiał do oceny, nie dowód.
  const fetchPage = deps.fetchPage;
  const urls = input.text && fetchPage ? extractUrls(input.text, MAX_URLS) : [];
  const pages = fetchPage ? await Promise.all(urls.map((u) => fetchPage(u))) : [];
  for (const page of pages) {
    if (page.ok) {
      registry.noteInjection(
        `url:${new URL(page.finalUrl).hostname}`,
        `${page.title}\n${page.text}`,
      );
    } else {
      preWarnings.push(
        `Nie udało się odczytać strony ${sanitizeUrl(page.url).url}: ${page.message}`,
      );
    }
  }

  const metrics = (steps: number, usage: VerifyMetrics['usage']): VerifyMetrics => ({
    usage,
    toolCalls: { ...registry.calls },
    sourceFailures: registry.failures.length,
    steps,
    injectionSignals: [...registry.injectionSignals],
    piiMasked: masked.found,
    pages: { fetched: pages.filter((p) => p.ok).length, failed: pages.filter((p) => !p.ok).length },
  });

  let output: AgentOutput;
  let steps = 0;
  let usage: VerifyMetrics['usage'] = null;
  try {
    const result = await generateText({
      model: deps.model,
      instructions: buildInstructions(startedAt),
      messages: buildMessages(masked.text, input.image, pages),
      tools: createTools(deps, registry),
      stopWhen: isStepCount(MAX_STEPS),
      output: Output.object({ schema: AgentOutput }),
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    });
    steps = result.steps.length;
    usage = {
      inputTokens: result.totalUsage.inputTokens,
      outputTokens: result.totalUsage.outputTokens,
      totalTokens: result.totalUsage.totalTokens,
    };
    output = result.output;
  } catch (err) {
    const { code, message } = classifyError(err, options.abortSignal);
    return {
      response: { ...meta(), status: 'error', code, message },
      metrics: metrics(steps, usage),
    };
  }

  return {
    response: postProcess(output, registry, meta(), startedAt, preWarnings),
    metrics: metrics(steps, usage),
  };
}

export function buildMessages(
  text: string | undefined,
  image: CheckRequest['image'],
  pages: PageResult[],
): ModelMessage[] {
  const parts: Array<
    { type: 'text'; text: string } | { type: 'file'; mediaType: string; data: string }
  > = [{ type: 'text', text: text ? wrapUserText(text) : IMAGE_ONLY_PROMPT }];
  for (const page of pages) parts.push({ type: 'text', text: wrapPage(page) });
  if (image) parts.push({ type: 'file', mediaType: image.mediaType, data: image.data });
  return [{ role: 'user', content: parts }];
}

export function injectionWarning(signal: InjectionSignal, registry: EvidenceRegistry): string {
  const tail =
    'wykryto polecenia skierowane do systemu (próba wpłynięcia na wynik). Zignorowaliśmy je.';
  if (signal.source === 'user') return `W zgłoszeniu ${tail}`;
  if (signal.source.startsWith('url:')) return `Na stronie ${signal.source.slice(4)} ${tail}`;
  const title = registry.byId.get(signal.source)?.title ?? signal.source;
  return `W materiale „${title}” ${tail}`;
}

function postProcess(
  output: AgentOutput,
  registry: EvidenceRegistry,
  meta: { checkId: string; createdAt: string; durationMs: number },
  now: Date,
  preWarnings: string[],
): CheckResponse {
  if (output.status !== 'ok' || output.claims.length === 0) {
    const status = output.status === 'ok' ? 'needs_clarification' : output.status;
    const message =
      output.message.trim() ||
      (status === 'out_of_scope'
        ? 'Ta usługa sprawdza informacje i pogłoski. Prześlij treść, którą chcesz zweryfikować.'
        : 'Nie udało się wydzielić twierdzenia do sprawdzenia. Napisz dokładniej, co chcesz zweryfikować.');
    return { ...meta, status, message };
  }

  const warnings = [
    ...preWarnings,
    ...registry.injectionSignals.map((s) => injectionWarning(s, registry)),
    ...output.warnings,
  ];
  const cited = new Map<string, Evidence>();

  const claims = output.claims.map((claim) => {
    const known = claim.evidenceIds.filter((id) => registry.byId.has(id));
    const unknown = claim.evidenceIds.filter((id) => !registry.byId.has(id));
    if (unknown.length > 0) {
      warnings.push(`Pominięto odwołania do nieistniejących dowodów: ${unknown.join(', ')}.`);
    }
    for (const id of known) {
      const e = registry.byId.get(id);
      if (e) cited.set(id, e);
    }

    // Werdykt rozstrzygający bez dowodu to pozorna odpowiedź: degradujemy go.
    if (DECISIVE_VERDICTS.includes(claim.verdict) && known.length === 0) {
      return {
        ...claim,
        verdict: 'brak wystarczających dowodów' as const,
        confidence: 'niska' as const,
        evidenceIds: [],
        limitations: [
          claim.limitations,
          'Nie znaleziono materiału źródłowego, który potwierdzałby ocenę.',
        ]
          .filter(Boolean)
          .join(' '),
      };
    }
    return { ...claim, evidenceIds: known };
  });

  if (registry.allToolCallsFailed) {
    warnings.push('Źródła danych były niedostępne. Wynik nie opiera się na żadnych materiałach.');
  } else {
    for (const f of registry.failures) {
      const label = f.tool === 'search_factchecks' ? 'Baza fact-checków' : 'Korpus dokumentów';
      warnings.push(`${label} była niedostępna (${f.message}).`);
    }
  }

  const evidence = [...cited.values()];
  for (const e of evidence) {
    if (e.publishedAt && isOlderThan(e.publishedAt, now, ARCHIVAL_AFTER_DAYS)) {
      warnings.push(
        `Materiał archiwalny: „${e.title}” (${e.publishedAt.slice(0, 10)}). Może być nieaktualny.`,
      );
    }
  }

  return {
    ...meta,
    status: 'ok',
    summary: output.summary,
    claims,
    evidence,
    warnings: [...new Set(warnings)],
  };
}

export function isOlderThan(date: string, now: Date, days: number): boolean {
  const t = Date.parse(date);
  return Number.isFinite(t) && now.getTime() - t > days * 24 * 60 * 60 * 1000;
}

export function classifyError(
  err: unknown,
  signal: AbortSignal | undefined,
): { code: ErrorCode; message: string } {
  if (
    signal?.aborted ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'))
  ) {
    return {
      code: 'timeout',
      message: 'Sprawdzenie trwało zbyt długo i zostało przerwane. Spróbuj ponownie.',
    };
  }
  if (APICallError.isInstance(err)) {
    const detail = err.statusCode ? ` (HTTP ${err.statusCode})` : '';
    return {
      code: 'llm_unavailable',
      message: `Model językowy jest chwilowo niedostępny${detail}. To awaria techniczna, a nie wynik sprawdzenia.`,
    };
  }
  return {
    code: 'internal',
    message: 'Wystąpił błąd techniczny podczas sprawdzania. To nie jest wynik sprawdzenia.',
  };
}
