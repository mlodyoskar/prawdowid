import type { SourceHit, SourceResult } from './types.ts';

const ENDPOINT = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';
const TIMEOUT_MS = 8000;

export type FactCheckQuery = {
  query: string;
  languageCode?: string;
  pageSize?: number;
};

export type FactCheckDeps = {
  apiKey: string | undefined;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

/** Fragment odpowiedzi Google Fact Check Tools API, z którego korzystamy. */
type ApiResponse = {
  claims?: Array<{
    text?: string;
    claimant?: string;
    claimDate?: string;
    claimReview?: Array<{
      publisher?: { name?: string; site?: string };
      url?: string;
      title?: string;
      reviewDate?: string;
      textualRating?: string;
      languageCode?: string;
    }>;
  }>;
};

/** Szuka zweryfikowanych twierdzeń w Google Fact Check Tools API. */
export async function searchFactChecks(
  { query, languageCode = 'pl', pageSize = 10 }: FactCheckQuery,
  { apiKey, fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS }: FactCheckDeps,
): Promise<SourceResult> {
  if (!apiKey) {
    return { ok: false, reason: 'missing_key', message: 'Brak klucza Google Fact Check API.' };
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('languageCode', languageCode);
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('key', apiKey);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    return {
      ok: false,
      reason: 'unavailable',
      message: timedOut
        ? 'Google Fact Check API nie odpowiedziało na czas.'
        : 'Błąd sieci przy zapytaniu do Google Fact Check API.',
    };
  }

  if (res.status === 429) {
    return {
      ok: false,
      reason: 'rate_limited',
      message: 'Przekroczony limit zapytań Google Fact Check API.',
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: 'unavailable',
      message: `Google Fact Check API zwróciło HTTP ${res.status}.`,
    };
  }

  let body: ApiResponse;
  try {
    body = (await res.json()) as ApiResponse;
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Nieprawidłowa odpowiedź Google Fact Check API.',
    };
  }

  return { ok: true, items: mapClaims(body) };
}

function mapClaims(body: ApiResponse): SourceHit[] {
  const hits: SourceHit[] = [];
  for (const claim of body.claims ?? []) {
    for (const review of claim.claimReview ?? []) {
      if (!review.url) continue;
      const claimText = claim.text ?? '';
      hits.push({
        kind: 'factcheck',
        title: review.title ?? claimText,
        publisher: review.publisher?.name ?? review.publisher?.site ?? new URL(review.url).hostname,
        url: review.url,
        publishedAt: review.reviewDate ?? null,
        fetchedAt: null,
        excerpt: claim.claimant ? `${claimText} (autor twierdzenia: ${claim.claimant})` : claimText,
        ...(review.textualRating ? { rating: review.textualRating } : {}),
        sourceType: 'secondary',
      });
    }
  }
  return hits;
}
