import type {
  CheckRequest,
  CheckResponse,
  ClaimResult,
  Evidence,
  UncheckedClaim,
  Verdict,
} from '@prawdowid/contracts';
import { extractUrls, type SourceResult } from '@prawdowid/sources';
import { generateText, Output, type LanguageModel, type ModelMessage } from 'ai';
import type { z } from 'zod';

import { describePii, maskPii, sanitizeUrl, type PiiKind } from './pii.ts';
import { applyGuardrails, type GuardedClaim } from './plan/guardrails.ts';
import {
  buildExtractInstructions,
  buildJudgeInstructions,
  buildJudgePrompt,
  buildRefineInstructions,
  buildRefinePrompt,
} from './plan/prompts.ts';
import { Extraction, Judgement, Refinement, type SearchRequest } from './plan/schemas.ts';
import { computeStrength } from './plan/strength.ts';
import { EvidenceRegistry, type ToolName } from './tools.ts';
import {
  ARCHIVAL_AFTER_DAYS,
  buildMessages,
  classifyError,
  injectionWarning,
  isOlderThan,
  MAX_URLS,
  type VerifyDeps,
  type VerifyMetrics,
  type VerifyOptions,
  type VerifyResult,
} from './verify.ts';

const DEFAULT_MAX_CLAIMS = 3;
const MIN_CLAIM_LENGTH = 3;
const MAX_SEARCHES_PER_CLAIM = 4;
const MAX_REFINE_SEARCHES = 3;
const MAX_RESULTS_PER_SEARCH = 6;
const MAX_EVIDENCE_PER_CLAIM = 12;
/** Runda poprawy startuje tylko, gdy od początku sprawdzenia minęło mniej niż tyle. */
const DEFAULT_REFINE_BUDGET_MS = 12_000;

const TOOL_NAMES: readonly ToolName[] = ['search_factchecks', 'search_corpus'];

const SOURCE_LABEL: Record<ToolName, string> = {
  search_factchecks: 'Baza fact-checków (Google Fact Check Tools)',
  search_corpus: 'Korpus dokumentów urzędowych',
};

const VERDICT_LABEL: Record<Verdict, string> = {
  potwierdzone: 'Potwierdzone',
  fałszywe: 'Fałszywe',
  'wprowadzające w błąd': 'Wprowadzające w błąd',
  'brak wystarczających dowodów': 'Brak wystarczających dowodów',
  'nie podlega weryfikacji': 'Nie podlega weryfikacji',
};

export type PlanStage = 'extract' | 'search' | 'judge' | 'refine' | 'compose';

export type PlanDeps = VerifyDeps & {
  /** Osobny model sędziego. Domyślnie ten sam co `model`. */
  judgeModel?: LanguageModel;
};

export type PlanOptions = VerifyOptions & {
  maxClaims?: number;
  /** 0 wyłącza rundę poprawy zapytań. */
  maxRefineRounds?: number;
  refineBudgetMs?: number;
  /** Domyślnie parametr nie jest wysyłany: część modeli go nie przyjmuje. */
  temperature?: number;
  onStage?: (stage: PlanStage) => void;
};

export type PlanMetrics = VerifyMetrics & {
  mode: 'plan';
  modelCalls: number;
  claims: number;
  refinedClaims: number;
  /** Rundy poprawy przerwane błędem lub limitem czasu: wynik opiera się wtedy na pierwszej ocenie. */
  refineErrors: number;
  /** Ile werdyktów sędziego kod zdegradował z braku oparcia w dowodach. */
  downgradedVerdicts: number;
  stageMs: Partial<Record<PlanStage, number>>;
};

/** Zgodny z `VerifyResult`, z dokładniejszym typem metryk. */
export type PlanResult = VerifyResult & { metrics: PlanMetrics };

type ClaimState = {
  text: string;
  checkable: boolean;
  notCheckableReason: string;
  searches: SearchRequest[];
  evidence: Map<string, Evidence>;
  /** Źródła, które zawiodły przy zapytaniach tego twierdzenia: etykieta → komunikat. */
  failures: Map<string, string>;
  /** Materiały związane z twierdzeniem, w których sędzia zauważył polecenia dla systemu. */
  hostile: Set<string>;
  judgement?: Judgement;
  guarded?: GuardedClaim;
};

/**
 * Tryb `plan`: model planuje zapytania, kod wykonuje je równolegle, a osobny sędzia bez narzędzi
 * ocenia każde twierdzenie. Werdykt, cytaty i siłę podstawy pilnuje kod (opis: docs/agent.md).
 * Ta sama sygnatura co `verify()`. Nigdy nie rzuca: awarie wracają jako `status: 'error'`.
 */
export async function verifyPlanned(
  input: CheckRequest,
  deps: PlanDeps,
  options: PlanOptions,
): Promise<PlanResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const elapsed = () => now().getTime() - startedAt.getTime();
  const registry = new EvidenceRegistry();
  const noted = new Set<string>();
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, seen: false };
  const stageMs: Partial<Record<PlanStage, number>> = {};
  let modelCalls = 0;
  let refinedClaims = 0;
  let refineErrors = 0;
  let claims: ClaimState[] = [];
  const piiFound = new Set<PiiKind>();
  /** Model przepisuje treść z obrazu i ze stron, więc jego teksty też maskujemy przed zapisem i źródłami. */
  const mask = (text: string): string => {
    const result = maskPii(text, startedAt);
    for (const kind of result.found) piiFound.add(kind);
    return result.text;
  };

  const meta = () => ({
    checkId: options.checkId,
    createdAt: startedAt.toISOString(),
    durationMs: elapsed(),
  });

  let stage: PlanStage | null = null;
  let stageStartedAt = 0;
  const enter = (next: PlanStage | null) => {
    if (stage) stageMs[stage] = (stageMs[stage] ?? 0) + (elapsed() - stageStartedAt);
    stage = next;
    stageStartedAt = elapsed();
    if (next) options.onStage?.(next);
  };

  // Maskowanie danych osobowych i strony z URL-i: jak w verify() (do scalenia, patrz docs/agent.md).
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

  const metrics = (): PlanMetrics => ({
    usage: usage.seen
      ? {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        }
      : null,
    toolCalls: { ...registry.calls },
    sourceFailures: registry.failures.length,
    steps: modelCalls,
    injectionSignals: [...registry.injectionSignals],
    piiMasked: [...new Set([...masked.found, ...piiFound])],
    pages: { fetched: pages.filter((p) => p.ok).length, failed: pages.filter((p) => !p.ok).length },
    mode: 'plan',
    modelCalls,
    claims: claims.length,
    refinedClaims,
    refineErrors,
    downgradedVerdicts: claims.filter((c) => c.guarded?.downgraded).length,
    stageMs: { ...stageMs },
  });

  const callModel = async <S extends z.ZodType>(
    model: LanguageModel,
    instructions: string,
    messages: ModelMessage[],
    schema: S,
  ): Promise<z.infer<S>> => {
    modelCalls++;
    const result = await generateText({
      model,
      instructions,
      messages,
      output: Output.object({ schema }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    });
    usage.seen = true;
    usage.inputTokens += result.totalUsage.inputTokens ?? 0;
    usage.outputTokens += result.totalUsage.outputTokens ?? 0;
    usage.totalTokens += result.totalUsage.totalTokens ?? 0;
    return schema.parse(result.output);
  };

  // Jedno wywołanie źródła na identyczne zapytanie, nawet gdy pyta o nie kilka twierdzeń.
  const searchCache = new Map<string, Promise<SourceResult>>();
  const runSearch = (request: SearchRequest): Promise<SourceResult> => {
    const languageCode = request.tool === 'search_corpus' ? 'pl' : request.languageCode;
    const key = searchKey({ ...request, languageCode });
    const cached = searchCache.get(key);
    if (cached) return cached;
    const pending = (async (): Promise<SourceResult> => {
      registry.calls[request.tool]++;
      let result: SourceResult;
      try {
        result =
          request.tool === 'search_factchecks'
            ? await deps.factchecks({ query: request.query, languageCode })
            : deps.corpus.search(request.query, { limit: MAX_RESULTS_PER_SEARCH });
      } catch (err) {
        result = {
          ok: false,
          reason: 'unavailable',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      if (!result.ok) {
        registry.failures.push({
          tool: request.tool,
          reason: result.reason,
          message: result.message,
        });
      }
      return result;
    })();
    searchCache.set(key, pending);
    return pending;
  };

  const search = async (claim: ClaimState, requests: readonly SearchRequest[]) => {
    const results = await Promise.all(requests.map((r) => runSearch(r)));
    for (const [i, result] of results.entries()) {
      const request = requests[i];
      if (!request) continue;
      if (!result.ok) {
        claim.failures.set(SOURCE_LABEL[request.tool], result.message);
        continue;
      }
      for (const hit of result.items.slice(0, MAX_RESULTS_PER_SEARCH)) {
        if (claim.evidence.size >= MAX_EVIDENCE_PER_CLAIM) break;
        const e = registry.register(hit);
        if (!noted.has(e.id)) {
          noted.add(e.id);
          registry.noteInjection(e.id, `${e.title}\n${e.excerpt}`);
        }
        claim.evidence.set(e.id, e);
      }
    }
  };

  const askJudge = (claim: ClaimState, evidence: readonly Evidence[]) =>
    callModel(
      deps.judgeModel ?? deps.model,
      buildJudgeInstructions(startedAt),
      [
        {
          role: 'user',
          content: buildJudgePrompt(
            claim.text,
            evidence,
            [...claim.failures].map(([label, message]) => `${label} (${message})`),
          ),
        },
      ],
      Judgement,
    );

  const judge = async (claim: ClaimState) => {
    // Materiał, w którym kod wykrył polecenia dla systemu, w ogóle nie trafia do sędziego:
    // nie może wtedy wpłynąć ani na werdykt, ani na dowody.
    const suspect = new Set(registry.injectionSignals.map((s) => s.source));
    let visible = [...claim.evidence.values()].filter((e) => !suspect.has(e.id));

    // Nie ma czego oceniać, a źródło zawiodło: wynik jest przesądzony, model niczego tu nie doda.
    if (visible.length === 0 && claim.failures.size > 0) {
      claim.judgement = {
        items: [],
        verdict: 'brak wystarczających dowodów',
        explanation: '',
        unknowns: [],
        limitations: '',
      };
      claim.guarded = applyGuardrails(claim.judgement, claim.evidence, suspect);
      return;
    }

    let judgement = await askJudge(claim, visible);
    // Polecenia, których wzorce nie złapały, a zauważył je sędzia: oceniamy jeszcze raz bez tego materiału.
    const hostile = judgement.items
      .filter((i) => i.addressesModel && i.relation !== 'unrelated' && claim.evidence.has(i.id))
      .map((i) => i.id);
    if (hostile.length > 0) {
      for (const id of hostile) claim.hostile.add(id);
      visible = visible.filter((e) => !claim.hostile.has(e.id));
      judgement = await askJudge(claim, visible);
    }
    claim.judgement = judgement;
    claim.guarded = applyGuardrails(
      judgement,
      claim.evidence,
      new Set([...suspect, ...claim.hostile]),
    );
  };

  /** Inne zapytania dla twierdzenia, którego nic nie dotyczyło wprost, i ponowna ocena. */
  const refine = async (claim: ClaimState): Promise<void> => {
    const refinement = await callModel(
      deps.model,
      buildRefineInstructions(startedAt),
      [
        {
          role: 'user',
          content: buildRefinePrompt(
            claim.text,
            claim.searches,
            [...claim.evidence.values()].map((e) => e.title),
          ),
        },
      ],
      Refinement,
    );
    const known = new Set(claim.searches.map((s) => searchKey(s)));
    const fresh = cleanSearches(refinement.searches, MAX_REFINE_SEARCHES, mask).filter(
      (s) => !known.has(searchKey(s)),
    );
    if (fresh.length === 0) return;
    const before = claim.evidence.size;
    claim.searches.push(...fresh);
    await search(claim, fresh);
    if (claim.evidence.size === before) return;
    refinedClaims++;
    await judge(claim);
  };

  try {
    // 1. Twierdzenia i plan zapytań.
    enter('extract');
    const maxClaims = options.maxClaims ?? DEFAULT_MAX_CLAIMS;
    const extraction = await callModel(
      deps.model,
      buildExtractInstructions(startedAt, maxClaims),
      buildMessages(masked.text, input.image, pages),
      Extraction,
    );
    if (extraction.status !== 'ok' || extraction.claims.length === 0) {
      enter(null);
      const status = extraction.status === 'ok' ? 'needs_clarification' : extraction.status;
      // Poza zakresem odpowiadamy stałym tekstem: model nie ma tu nic do dodania.
      const message =
        status === 'out_of_scope'
          ? 'Ta usługa sprawdza informacje i pogłoski. Prześlij treść, którą chcesz zweryfikować.'
          : extraction.message.trim() ||
            'Nie udało się wydzielić twierdzenia do sprawdzenia. Napisz dokładniej, co chcesz zweryfikować.';
      return { response: { ...meta(), status, message }, metrics: metrics() };
    }
    claims = extraction.claims
      .map((c) => ({ ...c, text: mask(c.text.trim()) }))
      .filter((c) => c.text.length >= MIN_CLAIM_LENGTH)
      .slice(0, maxClaims)
      .map((c) => ({
        text: c.text,
        checkable: c.checkable,
        notCheckableReason: mask(c.notCheckableReason.trim()),
        searches: c.checkable
          ? cleanSearches(c.searches, MAX_SEARCHES_PER_CLAIM, mask, c.text)
          : [],
        evidence: new Map(),
        failures: new Map(),
        hostile: new Set(),
      }));
    if (claims.length === 0) {
      enter(null);
      return {
        response: {
          ...meta(),
          status: 'needs_clarification',
          message:
            'Nie udało się wydzielić twierdzenia do sprawdzenia. Napisz dokładniej, co chcesz zweryfikować.',
        },
        metrics: metrics(),
      };
    }
    const checkable = claims.filter((c) => c.checkable);

    // 2. Wszystkie zapytania naraz.
    enter('search');
    await Promise.all(checkable.map((c) => search(c, c.searches)));

    // 3. Sędzia bez narzędzi, osobno dla każdego twierdzenia.
    enter('judge');
    await Promise.all(checkable.map((c) => judge(c)));

    // 4. Runda poprawy: tylko dla twierdzeń, których nic nie dotyczyło wprost, i tylko przy zapasie czasu.
    const refineBudgetMs = options.refineBudgetMs ?? DEFAULT_REFINE_BUDGET_MS;
    for (let round = 0; round < (options.maxRefineRounds ?? 1); round++) {
      const candidates = checkable.filter((c) => c.guarded && !c.guarded.hasDirect);
      if (candidates.length === 0 || elapsed() >= refineBudgetMs) break;
      enter('refine');
      await Promise.all(
        candidates.map(async (claim) => {
          // Pierwsza ocena już jest: błąd albo limit czasu w rundzie poprawy nie może jej skasować.
          try {
            await refine(claim);
          } catch {
            refineErrors++;
          }
        }),
      );
    }
    // 5. Złożenie wyniku: tu rozstrzyga już tylko kod.
    enter('compose');
    if (piiFound.size > 0) {
      preWarnings.push(
        `Ukryliśmy dane osobowe odczytane z przesłanego materiału (${describePii([...piiFound])}).`,
      );
    }
    const response = compose(claims, registry, meta, startedAt, preWarnings);
    enter(null);
    return { response: { ...response, durationMs: elapsed() }, metrics: metrics() };
  } catch (err) {
    enter(null);
    const { code, message } = classifyError(err, options.abortSignal);
    return { response: { ...meta(), status: 'error', code, message }, metrics: metrics() };
  }
}

function searchKey(request: SearchRequest): string {
  const languageCode = request.tool === 'search_corpus' ? 'pl' : request.languageCode;
  return `${request.tool}|${languageCode}|${request.query.trim().toLowerCase()}`;
}

/** Usuwa puste i powtórzone zapytania. Gdy model nie zaplanował żadnego, szukamy samym twierdzeniem. */
function cleanSearches(
  searches: readonly SearchRequest[],
  max: number,
  mask: (text: string) => string,
  fallbackQuery?: string,
): SearchRequest[] {
  const seen = new Set<string>();
  const out: SearchRequest[] = [];
  for (const s of searches) {
    const query = mask(s.query.trim().slice(0, 300));
    if (query.length < 2) continue;
    const request = { ...s, query };
    const key = searchKey(request);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(request);
    if (out.length >= max) break;
  }
  if (out.length === 0 && fallbackQuery) {
    const query = mask(fallbackQuery.trim().slice(0, 300));
    return [
      { tool: 'search_corpus', query, languageCode: 'pl' },
      { tool: 'search_factchecks', query, languageCode: 'pl' },
    ];
  }
  return out;
}

function compose(
  states: readonly ClaimState[],
  registry: EvidenceRegistry,
  meta: () => { checkId: string; createdAt: string; durationMs: number },
  now: Date,
  preWarnings: readonly string[],
): CheckResponse {
  const claims: ClaimResult[] = [];
  const unchecked: UncheckedClaim[] = [];
  const cited = new Map<string, Evidence>();

  for (const state of states) {
    if (!state.checkable) {
      const strength = computeStrength({
        verdict: 'nie podlega weryfikacji',
        basis: [],
        discrepancy: false,
        now,
      });
      claims.push({
        claim: state.text,
        verdict: 'nie podlega weryfikacji',
        confidence: strength.confidence,
        explanation:
          state.notCheckableReason ||
          'To opinia, ocena albo prognoza, a nie informacja, którą da się sprawdzić w źródłach.',
        evidenceIds: [],
        limitations: '',
        evidenceUse: [],
        confidenceReasons: strength.reasons,
        unknowns: [],
      });
      continue;
    }

    const { guarded, judgement } = state;
    if (!guarded || !judgement) continue;

    for (const id of new Set([...guarded.flagged, ...state.hostile])) {
      if (!registry.injectionSignals.some((s) => s.source === id)) {
        registry.injectionSignals.push({ source: id, pattern: 'judge_flag' });
      }
    }

    const failed = [...state.failures.keys()];
    // Brak dowodów przy niedostępnym źródle to nie wynik merytoryczny, tylko niesprawdzone twierdzenie.
    if (
      guarded.verdict === 'brak wystarczających dowodów' &&
      failed.length > 0 &&
      !guarded.hasDirect
    ) {
      unchecked.push({
        claim: state.text,
        reason: `Nie udało się sprawdzić: ${describeFailures(state.failures)}`,
      });
      continue;
    }

    const strength = computeStrength({
      verdict: guarded.verdict,
      basis: guarded.basis,
      discrepancy: guarded.discrepancy,
      hasDirect: guarded.hasDirect,
      now,
    });
    for (const use of guarded.evidenceUse) {
      const e = registry.byId.get(use.id);
      if (e) cited.set(use.id, e);
    }
    claims.push({
      claim: state.text,
      verdict: guarded.verdict,
      confidence: strength.confidence,
      // Uzasadnienie sędziego dotyczyło werdyktu, którego nie utrzymaliśmy.
      explanation: !guarded.downgraded
        ? judgement.explanation.trim()
        : guarded.hasDirect
          ? 'Znalezione materiały dotyczą tego twierdzenia, ale nie pozwalają go jednoznacznie rozstrzygnąć. Zobacz źródła i oceń sam.'
          : 'Nie znaleźliśmy materiału, który wprost potwierdza albo obala to twierdzenie. To nie znaczy, że jest ono prawdziwe lub fałszywe.',
      evidenceIds: guarded.evidenceUse.map((u) => u.id),
      limitations: [
        judgement.limitations.trim(),
        ...guarded.notes,
        ...(failed.length > 0
          ? [
              `Nie sprawdziliśmy wszystkich źródeł: ${describeFailures(state.failures)} Wynik opiera się na pozostałych.`,
            ]
          : []),
      ]
        .filter(Boolean)
        .join(' '),
      evidenceUse: guarded.evidenceUse,
      confidenceReasons: strength.reasons,
      unknowns: judgement.unknowns.map((u) => u.trim()).filter(Boolean),
      ...(guarded.discrepancy ? { discrepancy: true } : {}),
    });
  }

  if (claims.length === 0) {
    return {
      ...meta(),
      status: 'error',
      code: 'sources_unavailable',
      message: `Nie mogliśmy teraz sprawdzić tej informacji, bo źródła danych były niedostępne (${[
        ...new Set(registry.failures.map((f) => SOURCE_LABEL[f.tool])),
      ].join(', ')}). To awaria techniczna, a nie wynik sprawdzenia. Spróbuj ponownie później.`,
    };
  }

  // Zgłoszenie, podana strona i materiały ocenione przez sędziego jako związane z twierdzeniem
  // dostają osobne ostrzeżenie. Trafienia odrzucone po wzorcu zliczamy razem: nie wiemy, czy dotyczyły sprawy.
  const judged = new Set(states.flatMap((s) => [...s.hostile, ...(s.guarded?.quarantined ?? [])]));
  const byPattern = new Set(
    registry.injectionSignals
      .filter((s) => registry.byId.has(s.source) && s.pattern !== 'judge_flag')
      .map((s) => s.source),
  );
  const warnings = [
    ...preWarnings,
    ...registry.injectionSignals
      .filter(
        (s) =>
          s.source === 'user' ||
          s.source.startsWith('url:') ||
          (judged.has(s.source) && !byPattern.has(s.source)),
      )
      .map((s) => injectionWarning(s, registry)),
  ];
  if (byPattern.size > 0) {
    warnings.push(
      `Pominęliśmy znalezione materiały z poleceniami skierowanymi do systemu (${byPattern.size}). Nie wpłynęły na wynik.`,
    );
  }
  const succeeded = (tool: ToolName) =>
    registry.calls[tool] - registry.failures.filter((f) => f.tool === tool).length;
  for (const tool of TOOL_NAMES) {
    if (succeeded(tool) === registry.calls[tool]) continue;
    warnings.push(
      succeeded(tool) === 0
        ? `Źródło było niedostępne podczas sprawdzania: ${SOURCE_LABEL[tool]}.`
        : `Część zapytań do źródła się nie powiodła: ${SOURCE_LABEL[tool]}.`,
    );
  }
  const evidence = [...cited.values()];
  for (const e of evidence) {
    if (e.publishedAt && isOlderThan(e.publishedAt, now, ARCHIVAL_AFTER_DAYS)) {
      warnings.push(
        `Materiał archiwalny: „${e.title}” (${e.publishedAt.slice(0, 10)}). Może być nieaktualny.`,
      );
    }
  }
  if (evidence.some((e) => e.isMock)) {
    warnings.push('Część dowodów pochodzi z danych testowych (mock), a nie z prawdziwych źródeł.');
  }

  const searched = TOOL_NAMES.filter((tool) => succeeded(tool) > 0).map(
    (tool) => SOURCE_LABEL[tool],
  );

  return {
    ...meta(),
    status: 'ok',
    summary: summarize(claims, unchecked.length),
    claims,
    evidence,
    warnings: [...new Set(warnings)],
    ...(unchecked.length > 0 ? { unchecked } : {}),
    searched,
    mode: 'plan',
  };
}

function describeFailures(failures: ReadonlyMap<string, string>): string {
  return [...failures].map(([label, message]) => `${label}: ${message}`).join(' ');
}

/** Podsumowanie składa kod, żeby nie dało się w nim przemycić oceny bez pokrycia w werdyktach. */
function summarize(claims: readonly ClaimResult[], uncheckedCount: number): string {
  const [only] = claims;
  if (only && claims.length === 1 && uncheckedCount === 0) {
    return `${VERDICT_LABEL[only.verdict]}. ${only.explanation}`;
  }
  const counts = new Map<Verdict, number>();
  for (const c of claims) counts.set(c.verdict, (counts.get(c.verdict) ?? 0) + 1);
  const parts = [...counts].map(([verdict, n]) => `${VERDICT_LABEL[verdict].toLowerCase()}: ${n}`);
  const tail = uncheckedCount > 0 ? ` Nie udało się sprawdzić: ${uncheckedCount}.` : '';
  return `Ocenione twierdzenia: ${claims.length} (${parts.join(', ')}).${tail}`;
}
