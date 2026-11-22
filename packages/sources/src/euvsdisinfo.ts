import type { SourceFailureReason } from './types.ts';

/**
 * Baza incydentów EUvsDisinfo (East StratCom Task Force ESDZ) przez serwer MCP, narzędzie `search`.
 * Wynik to KONTEKST: przypadek opisuje znany przekaz dezinformacyjny, a nie dowód w sprawie
 * twierdzenia użytkownika. Nigdy nie trafia do dowodów ani nie zmienia werdyktu (docs/research/euvsdisinfo.md).
 */

export const EUVSDISINFO_MCP_URL = 'https://mcp.euvsd.info/mcp';
const TIMEOUT_MS = 3000;
const CASE_URL_PREFIX = 'https://euvsdisinfo.eu/report/';
const MAX_SUMMARY_CHARS = 600;

export type IncidentHit = {
  title: string;
  /** Strona przypadku w euvsdisinfo.eu. */
  url: string;
  /** Streszczenie przekazu dezinformacyjnego (pole SUMMARY). Dane niezaufane. */
  summary: string;
};

export type IncidentSearchResult =
  | { ok: true; items: IncidentHit[] }
  | { ok: false; reason: SourceFailureReason; message: string };

export type IncidentQuery = { query: string; limit?: number };

export type IncidentDeps = {
  apiKey: string | undefined;
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

type SearchItem = { type?: string; title?: string; content?: string; link?: string };
type RpcBody = {
  result?: { structuredContent?: { results?: SearchItem[] }; isError?: boolean };
  error?: { code?: number; message?: string };
};

const UNAVAILABLE = (message: string): IncidentSearchResult => ({
  ok: false,
  reason: 'unavailable',
  message,
});

/** Szuka przypadków podobnych do zapytania. Nie rzuca: awarie wracają jako `ok: false`. */
export async function searchIncidents(
  { query, limit = 5 }: IncidentQuery,
  {
    apiKey,
    endpoint = EUVSDISINFO_MCP_URL,
    fetch = globalThis.fetch,
    timeoutMs = TIMEOUT_MS,
  }: IncidentDeps,
): Promise<IncidentSearchResult> {
  if (!apiKey) {
    return { ok: false, reason: 'missing_key', message: 'Brak klucza EUvsDisinfo.' };
  }
  const trimmed = query.trim().slice(0, 300);
  if (trimmed.length < 3) return { ok: true, items: [] };

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${apiKey}`,
        // Tryb bezstanowy serwera: identyfikator generowany po stronie klienta, bez `initialize`.
        'mcp-session-id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: trimmed } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    return UNAVAILABLE(
      timedOut
        ? 'EUvsDisinfo nie odpowiedziało na czas.'
        : 'Błąd sieci przy zapytaniu do EUvsDisinfo.',
    );
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'missing_key', message: 'EUvsDisinfo odrzuciło klucz API.' };
  }
  if (res.status === 429) {
    return {
      ok: false,
      reason: 'rate_limited',
      message: 'Przekroczony limit zapytań EUvsDisinfo.',
    };
  }
  if (!res.ok) return UNAVAILABLE(`EUvsDisinfo zwróciło HTTP ${res.status}.`);

  let body: RpcBody;
  try {
    body = parseRpc(await res.text());
  } catch {
    return UNAVAILABLE('Nieprawidłowa odpowiedź EUvsDisinfo.');
  }
  if (body.error) {
    return body.error.code === -32001
      ? { ok: false, reason: 'missing_key', message: 'EUvsDisinfo odrzuciło klucz API.' }
      : UNAVAILABLE('EUvsDisinfo zwróciło błąd wyszukiwania.');
  }
  const results = body.result?.structuredContent?.results;
  if (body.result?.isError || !Array.isArray(results)) {
    return UNAVAILABLE('EUvsDisinfo zwróciło błąd wyszukiwania.');
  }
  return { ok: true, items: mapCases(results).slice(0, limit) };
}

/** Odpowiedź przychodzi jako JSON albo strumień SSE (`data: {...}`). */
export function parseRpc(text: string): RpcBody {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed) as RpcBody;
  const data = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
  return JSON.parse(data) as RpcBody;
}

/** Tylko przypadki (`claim_review`) z adresem strony przypadku; artykuły analityczne pomijamy. */
function mapCases(results: readonly SearchItem[]): IncidentHit[] {
  const hits: IncidentHit[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (item.type !== 'claim_review' || !item.title || !item.link) continue;
    if (!item.link.startsWith(CASE_URL_PREFIX) || seen.has(item.link)) continue;
    const summary = extractSummary(item.content ?? '');
    if (!summary) continue;
    seen.add(item.link);
    hits.push({ title: htmlToText(item.title), url: item.link, summary });
  }
  return hits;
}

/** Treść ma postać `<h3>SUMMARY</h3><p>…</p><h3>RESPONSE</h3>…`. Bierzemy część SUMMARY. */
function extractSummary(html: string): string {
  const text = htmlToText(html.replace(/<h3>\s*RESPONSE\s*<\/h3>[\s\S]*$/i, ''));
  const summary = text.replace(/^\s*SUMMARY\s*/i, '').trim();
  return summary.length > MAX_SUMMARY_CHARS
    ? `${summary.slice(0, MAX_SUMMARY_CHARS).replace(/\s+\S*$/, '')}…`
    : summary;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  '#039': "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

function decodeEntity(name: string): string | undefined {
  const known = ENTITIES[name];
  if (known !== undefined) return known;
  const code = /^#x([0-9a-f]+)$/i.exec(name)?.[1] ?? /^#(\d+)$/.exec(name)?.[1];
  if (code === undefined) return undefined;
  const point = Number.parseInt(code, name.startsWith('#x') || name.startsWith('#X') ? 16 : 10);
  return Number.isFinite(point) && point > 0 && point <= 0x10ffff
    ? String.fromCodePoint(point)
    : undefined;
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h\d|li|div)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (m, name: string) => decodeEntity(name) ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}
