import type { Evidence } from '@prawdowid/contracts';
import type { SourceHit, SourceResult } from '@prawdowid/sources';
import { tool } from 'ai';
import { z } from 'zod';

import { detectInjection, type InjectionSignal } from './injection.ts';

const MAX_EXCERPT_CHARS = 600;
const MAX_RESULTS_PER_CALL = 8;

/** Źródła, z których korzysta agent. Wstrzykiwane, żeby testować bez sieci i bazy. */
export type AgentSources = {
  factchecks: (query: { query: string; languageCode: 'pl' | 'en' }) => Promise<SourceResult>;
  corpus: {
    search: (query: string, options?: { limit?: number }) => SourceResult;
    /** Kolejne fragmenty jednego dokumentu. Tryb `plan` doczytuje nimi dokument, który nie rozstrzygnął. */
    fragments?: (url: string, options?: { limit?: number }) => SourceResult;
  };
};

export type ToolName = 'search_factchecks' | 'search_corpus';

/** Stan jednego sprawdzenia: dowody zwrócone przez narzędzia (po id) i statystyki wywołań. */
export class EvidenceRegistry {
  readonly byId = new Map<string, Evidence>();
  readonly calls: Record<ToolName, number> = { search_factchecks: 0, search_corpus: 0 };
  readonly failures: Array<{ tool: ToolName; reason: string; message: string }> = [];
  /** Wykryte próby prompt injection (w zgłoszeniu, na stronach i w materiałach źródłowych). */
  readonly injectionSignals: InjectionSignal[] = [];
  #counters = { fc: 0, doc: 0 };

  /**
   * Nadaje trafieniu id. Ten sam materiał w jednym sprawdzeniu dostaje to samo id.
   * Różne fragmenty jednego dokumentu to osobne materiały: każdy ma własną treść do cytowania.
   */
  register(hit: SourceHit): Evidence {
    for (const existing of this.byId.values()) {
      if (
        existing.url === hit.url &&
        existing.kind === hit.kind &&
        existing.fragmentId === hit.fragmentId
      ) {
        return existing;
      }
    }
    const prefix = hit.kind === 'factcheck' ? 'fc' : 'doc';
    const id = `${prefix}_${++this.#counters[prefix]}`;
    const evidence: Evidence = { id, ...hit };
    this.byId.set(id, evidence);
    return evidence;
  }

  noteInjection(source: string, text: string): void {
    for (const pattern of detectInjection(text)) this.injectionSignals.push({ source, pattern });
  }

  get allToolCallsFailed(): boolean {
    const total = this.calls.search_factchecks + this.calls.search_corpus;
    return total > 0 && this.failures.length === total;
  }
}

/**
 * Wynik narzędzia widziany przez model. Treść źródeł jest w polu `untrusted_content`:
 * to dane do oceny, a nie instrukcje (ochrona przed prompt injection).
 */
function toModelResult(toolName: ToolName, result: SourceResult, registry: EvidenceRegistry) {
  registry.calls[toolName]++;
  if (!result.ok) {
    registry.failures.push({ tool: toolName, reason: result.reason, message: result.message });
    return {
      status: 'source_unavailable' as const,
      reason: result.reason,
      message: result.message,
    };
  }
  const results = result.items.slice(0, MAX_RESULTS_PER_CALL).map((hit) => {
    const e = registry.register(hit);
    const excerpt = truncate(e.excerpt, MAX_EXCERPT_CHARS);
    registry.noteInjection(e.id, `${e.title}\n${excerpt}`);
    return {
      id: e.id,
      title: e.title,
      publisher: e.publisher,
      publishedAt: e.publishedAt,
      ...(e.rating ? { factCheckRating: e.rating } : {}),
      ...(e.sourceType ? { sourceType: e.sourceType } : {}),
      untrusted_content: excerpt,
    };
  });
  return { status: 'ok' as const, count: results.length, results };
}

export function createTools(sources: AgentSources, registry: EvidenceRegistry) {
  return {
    search_factchecks: tool({
      description:
        'Szuka twierdzenia w bazie zweryfikowanych informacji organizacji fact-checkingowych (Google Fact Check Tools). ' +
        'Używaj dla pogłosek i twierdzeń krążących w internecie i mediach społecznościowych. ' +
        'Zapytanie formułuj jako krótkie twierdzenie lub kilka słów kluczowych. ' +
        'Gdy po polsku nic nie ma, spróbuj po angielsku (languageCode: "en").',
      inputSchema: z.object({
        query: z.string().min(2).max(300).describe('Krótkie twierdzenie lub słowa kluczowe'),
        languageCode: z.enum(['pl', 'en']).describe('Język zapytania'),
      }),
      execute: async ({ query, languageCode }) =>
        toModelResult(
          'search_factchecks',
          await sources.factchecks({ query, languageCode }),
          registry,
        ),
    }),
    search_corpus: tool({
      description:
        'Pełnotekstowe wyszukiwanie w korpusie dokumentów urzędowych i wiarygodnych mediów ' +
        '(komunikaty i ostrzeżenia MSZ, RCB, GIS, IMGW, GDDKiA, ministerstw, agencji prasowych). ' +
        'Używaj słów kluczowych po polsku (nazwy, miejsca, instytucje), nie całych zdań. ' +
        'Wyszukiwanie dopasowuje słowa, nie znaczenie: przy braku wyników spróbuj synonimów.',
      inputSchema: z.object({
        query: z.string().min(2).max(300).describe('Słowa kluczowe po polsku'),
      }),
      execute: async ({ query }) =>
        toModelResult(
          'search_corpus',
          sources.corpus.search(query, { limit: MAX_RESULTS_PER_CALL }),
          registry,
        ),
    }),
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
