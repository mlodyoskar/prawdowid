import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Pobiera stronę wskazaną przez użytkownika, żeby agent mógł ocenić jej treść.
 * Strona NIE jest dowodem, tylko materiałem do oceny.
 * Zabezpieczenia: tylko http/https na portach 80/443, odrzucanie adresów prywatnych (SSRF,
 * także po przekierowaniach), timeout, limit rozmiaru, tylko text/html. Nie obchodzimy
 * zabezpieczeń stron (403 / wyzwanie JS → `blocked`).
 */

export type PageFailureReason =
  | 'invalid_url'
  | 'forbidden_address'
  | 'blocked'
  | 'unsupported'
  | 'too_large'
  | 'unavailable';

export type PageResult =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      title: string;
      publisher: string;
      publishedAt: string | null;
      fetchedAt: string;
      text: string;
    }
  | { ok: false; url: string; reason: PageFailureReason; message: string };

export type FetchPageDeps = {
  fetch?: typeof globalThis.fetch;
  lookup?: (hostname: string) => Promise<string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxTextChars?: number;
  now?: () => Date;
};

const USER_AGENT = 'Mozilla/5.0 (compatible; PrawdowidFactCheckBot/0.1)';

const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  PRIVATE.addSubnet(net, prefix, 'ipv6');
}

export function isPrivateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (mapped) return isPrivateAddress(mapped);
  const family = isIP(ip);
  if (family === 4) return PRIVATE.check(ip, 'ipv4');
  if (family === 6) return PRIVATE.check(ip, 'ipv6');
  return true;
}

const defaultLookup = async (hostname: string) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

/** Wyciąga z tekstu adresy http(s), maksymalnie `max`. */
export function extractUrls(text: string, max = 2): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'«»()[\]{}]+/gi) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:!?]+$/, ''));
  return [...new Set(cleaned)].slice(0, max);
}

export async function fetchPage(rawUrl: string, deps: FetchPageDeps = {}): Promise<PageResult> {
  const {
    fetch = globalThis.fetch,
    lookup = defaultLookup,
    timeoutMs = 6000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 3,
    maxTextChars = 8000,
    now = () => new Date(),
  } = deps;
  const fail = (reason: PageFailureReason, message: string): PageResult => ({
    ok: false,
    url: rawUrl,
    reason,
    message,
  });
  const signal = AbortSignal.timeout(timeoutMs);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail('invalid_url', 'Nieprawidłowy adres strony.');
  }

  try {
    for (let hop = 0; ; hop++) {
      const check = await checkTarget(url, lookup);
      if (check) return fail(check.reason, check.message);

      const res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location)
          return fail(
            'unavailable',
            `Strona zwróciła przekierowanie bez adresu (HTTP ${res.status}).`,
          );
        if (hop >= maxRedirects) return fail('unavailable', 'Zbyt wiele przekierowań.');
        url = new URL(location, url);
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        return fail('blocked', `Strona nie pozwala na automatyczne pobranie (HTTP ${res.status}).`);
      }
      if (!res.ok) return fail('unavailable', `Strona zwróciła HTTP ${res.status}.`);

      const type = res.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
        return fail('unsupported', 'Pod tym adresem nie ma strony HTML (np. plik lub obraz).');
      }
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > maxBytes) return fail('too_large', 'Strona jest za duża do analizy.');

      const html = await readLimited(res, maxBytes);
      if (html === null) return fail('too_large', 'Strona jest za duża do analizy.');

      const page = parseHtml(html, maxTextChars);
      if (isJsChallenge(html, page.text)) {
        return fail(
          'blocked',
          'Strona wymaga uruchomienia JavaScriptu lub weryfikacji antybotowej. Nie obchodzimy takich zabezpieczeń.',
        );
      }
      return {
        ok: true,
        url: rawUrl,
        finalUrl: url.href,
        title: page.title || url.hostname,
        publisher: page.siteName || url.hostname,
        publishedAt: page.publishedAt,
        fetchedAt: now().toISOString(),
        text: page.text,
      };
    }
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return fail(
      'unavailable',
      timedOut ? 'Strona nie odpowiedziała na czas.' : 'Nie udało się połączyć ze stroną.',
    );
  }
}

async function checkTarget(
  url: URL,
  lookup: (hostname: string) => Promise<string[]>,
): Promise<{ reason: PageFailureReason; message: string } | null> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { reason: 'invalid_url', message: 'Obsługujemy tylko adresy http i https.' };
  }
  if (url.port !== '' && url.port !== '80' && url.port !== '443') {
    return {
      reason: 'forbidden_address',
      message: 'Obsługujemy tylko standardowe porty (80, 443).',
    };
  }
  if (url.username || url.password) {
    return { reason: 'invalid_url', message: 'Adres z danymi logowania nie jest obsługiwany.' };
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await lookup(host);
  } catch {
    return { reason: 'unavailable', message: 'Nie można odnaleźć tej domeny.' };
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    return {
      reason: 'forbidden_address',
      message: 'Ten adres wskazuje na sieć wewnętrzną i nie zostanie pobrany.',
    };
  }
  return null;
}

async function readLimited(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X'
          ? Number.parseInt(e.slice(2), 16)
          : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function meta(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    'i',
  );
  const m = re.exec(html);
  const v = m?.[1] ?? m?.[2];
  return v ? decodeEntities(v).trim() : null;
}

/** „Readability-lite”: tytuł, og:*, treść z <article>/<main>/<body> bez skryptów i stylów. */
export function parseHtml(html: string, maxTextChars = 8000) {
  const title =
    meta(html, 'og:title') ??
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const siteName = meta(html, 'og:site_name');
  const publishedAt = meta(html, 'article:published_time') ?? meta(html, 'date') ?? null;

  const cleaned = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const region =
    /<article[\s\S]*?<\/article>/i.exec(cleaned)?.[0] ??
    /<main[\s\S]*?<\/main>/i.exec(cleaned)?.[0] ??
    /<body[\s\S]*?<\/body>/i.exec(cleaned)?.[0] ??
    cleaned;
  const withoutChrome = region.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ');
  const text = decodeEntities(
    withoutChrome.replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

  return {
    title,
    siteName,
    publishedAt,
    text: text.length > maxTextChars ? `${text.slice(0, maxTextChars)}…` : text,
  };
}

function isJsChallenge(html: string, text: string): boolean {
  return (
    /_Incapsula_Resource|cf-browser-verification|challenge-platform|Just a moment\.\.\./i.test(
      html,
    ) ||
    (text.length < 200 && /enable javascript|włącz javascript/i.test(text))
  );
}
