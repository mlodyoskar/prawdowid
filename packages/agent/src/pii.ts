import { isIP } from 'node:net';

/**
 * Automatyczne maskowanie oczywistych danych osobowych (wymóg „Prywatność”).
 * Stosowane przed zapisem pytania do bazy i przed wysłaniem do modelu.
 * `found` zawiera tylko kategorie, nigdy same wartości.
 *
 * Zasada: zamaskowanie kwoty lub liczby, której dotyczy twierdzenie, psuje weryfikację.
 * Dlatego słabe identyfikatory (NIP, REGON, paszport, karta bez grup) maskujemy tylko z etykietą,
 * wrażliwe (PESEL) agresywnie, ale z pełną walidacją. Liczba z walutą lub jednostką albo
 * poprzedzona słowem kwoty („budżet”, „koszt”…) nie jest maskowana, chyba że ma etykietę.
 * Nazwisk, miejsc i dat nie maskujemy: to sedno twierdzeń.
 */

export type PiiKind =
  | 'EMAIL'
  | 'IBAN'
  | 'KARTA'
  | 'PESEL'
  | 'NIP'
  | 'REGON'
  | 'PASZPORT'
  | 'DOWOD'
  | 'KW'
  | 'IP'
  | 'TELEFON';

const LABELS: Record<PiiKind, string> = {
  EMAIL: 'adres e-mail',
  IBAN: 'numer konta',
  KARTA: 'numer karty',
  PESEL: 'PESEL',
  NIP: 'NIP',
  REGON: 'REGON',
  PASZPORT: 'numer paszportu',
  DOWOD: 'numer dowodu osobistego',
  KW: 'numer księgi wieczystej',
  IP: 'adres IP',
  TELEFON: 'numer telefonu',
};

export function describePii(kinds: readonly PiiKind[]): string {
  return kinds.map((k) => LABELS[k]).join(', ');
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

// ---------- walidatory ----------

function luhn(num: string): boolean {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function weightedSum(digits: string, weights: readonly number[]): number {
  return weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
}

const PESEL_CENTURY: Array<[number, number, number]> = [
  // [od miesiąca, do miesiąca, stulecie]
  [1, 12, 1900],
  [21, 32, 2000],
  [41, 52, 2100],
  [61, 72, 2200],
  [81, 92, 1800],
];

export function validPesel(p: string, now: Date): boolean {
  if (!/^\d{11}$/.test(p)) return false;
  const check = (10 - (weightedSum(p, [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]) % 10)) % 10;
  if (check !== Number(p[10])) return false;
  const yy = Number(p.slice(0, 2));
  const mm = Number(p.slice(2, 4));
  const dd = Number(p.slice(4, 6));
  const range = PESEL_CENTURY.find(([from, to]) => mm >= from && mm <= to);
  if (!range) return false;
  const year = range[2] + yy;
  const month = mm - range[0] + 1;
  const date = new Date(Date.UTC(year, month - 1, dd));
  const dayExists =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === dd;
  return dayExists && date.getTime() <= now.getTime();
}

export function validNip(nip: string): boolean {
  if (!/^\d{10}$/.test(nip)) return false;
  const rest = weightedSum(nip, [6, 5, 7, 2, 3, 4, 5, 6, 7]) % 11;
  return rest !== 10 && rest === Number(nip[9]);
}

export function validRegon(regon: string): boolean {
  if (/^\d{9}$/.test(regon)) {
    const rest = weightedSum(regon, [8, 9, 2, 3, 4, 5, 6, 7]) % 11;
    return (rest === 10 ? 0 : rest) === Number(regon[8]);
  }
  if (/^\d{14}$/.test(regon)) {
    const rest = weightedSum(regon, [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8]) % 11;
    return (rest === 10 ? 0 : rest) === Number(regon[13]);
  }
  return false;
}

const letterValue = (c: string) => c.charCodeAt(0) - 55; // A=10 … Z=35

/** Dowód osobisty: 3 litery + 6 cyfr, 4. znak to cyfra kontrolna (waga 9 ≡ −1 mod 10). */
export function validIdCard(id: string): boolean {
  const s = id.replace(/\s/g, '');
  if (!/^[A-Z]{3}\d{6}$/.test(s)) return false;
  const weights = [7, 3, 1, 9, 7, 3, 1, 7, 3];
  const sum = s
    .split('')
    .reduce((acc, c, i) => acc + (weights[i] ?? 0) * (i < 3 ? letterValue(c) : Number(c)), 0);
  return sum % 10 === 0;
}

/** Wartości znaków numeru księgi wieczystej (bez Q i V). */
const KW_VALUES: Record<string, number> = Object.fromEntries(
  '0123456789XABCDEFGHIJKLMNOPRSTUWYZ'.split('').map((c, i) => [c, i]),
);

export function validLandRegister(kw: string): boolean {
  const m = /^([A-Z]{2}\d[A-Z])\/(\d{8})\/(\d)$/.exec(kw);
  if (!m) return false;
  const chars = `${m[1]}${m[2]}`.split('');
  const weights = [1, 3, 7];
  let sum = 0;
  for (const [i, c] of chars.entries()) {
    const v = KW_VALUES[c];
    if (v === undefined) return false;
    sum += v * (weights[i % 3] ?? 0);
  }
  return sum % 10 === Number(m[3]);
}

// ---------- kontekst ----------

const AMOUNT_AFTER = /^\s?(?:zł|pln|eur|euro|usd|\$|€|mln|mld|tys|osób|osoby|ludzi|km|%|szt)/i;
const AMOUNT_BEFORE =
  /(?:kwota|kwoty|kwocie|budżet\w*|koszt\w*|wartość|wartości|suma|sumy)[\s:]*(?:to\s+|wynosi\s+|wyniesie\s+)?$/i;

type Ctx = { before: string; after: string; now: Date };

type Rule = {
  kind: PiiKind;
  re: RegExp;
  /** Etykieta szukana tuż przed dopasowaniem (np. „PESEL: ”). */
  label?: RegExp;
  /** Bez etykiety nie maskujemy wcale. */
  requireLabel?: boolean;
  /** Walidacja bez etykiety. */
  valid?: (match: string, ctx: Ctx) => boolean;
  /** Walidacja, gdy etykieta jest obecna (domyślnie: maskuj zawsze). */
  validLabeled?: (match: string, ctx: Ctx) => boolean;
  /** Reguła cyfrowa: obowiązuje wykluczenie kwot i jednostek. */
  numeric?: boolean;
};

const PESEL_LABEL = /pesel\W{0,15}$/i;

/** Kolejność ma znaczenie: dłuższe i bardziej specyficzne wzorce najpierw. */
const RULES: Rule[] = [
  { kind: 'EMAIL', re: /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/gu },
  // IBAN PL lub NRB: 26 cyfr, opcjonalnie w grupach po 4.
  { kind: 'IBAN', re: /\b(?:PL ?)?\d{2}(?:[ -]?\d{4}){6}\b/gi, numeric: true },
  {
    kind: 'KW',
    re: /\b[A-Z]{2}\d[A-Z]\/\d{8}\/\d\b/g,
    label: /(?:księg\w+\s+wieczyst\w+|\bkw)\W{0,15}$/i,
    valid: (m) => validLandRegister(m),
  },
  {
    kind: 'KARTA',
    re: /\b\d{4}(?:[ -]?\d{4}){2}[ -]?\d{1,7}\b/g,
    label: /(?:kart[aęy]|nr\s+karty|numer\s+karty)\W{0,15}$/i,
    numeric: true,
    // Bez etykiety: tylko grupy po 4 cyfry z separatorami.
    valid: (m) => {
      const d = digitsOf(m);
      return (
        /^\d{4}(?:[ -]\d{4}){2,3}(?:[ -]\d{1,3})?$/.test(m) &&
        d.length >= 13 &&
        d.length <= 19 &&
        luhn(d)
      );
    },
    validLabeled: (m) => {
      const d = digitsOf(m);
      return d.length >= 13 && d.length <= 19 && luhn(d);
    },
  },
  // Telefon z prefiksem 48 bez plusa: sprawdzany przed PESEL-em (to też 11 cyfr).
  {
    kind: 'TELEFON',
    re: /(?<![\d+])\b48[ -]?[1-9]\d{2}[ -]?\d{3}[ -]?\d{3}\b(?![ .,]?\d)/g,
    numeric: true,
    valid: (_m, ctx) => !PESEL_LABEL.test(ctx.before),
  },
  {
    kind: 'PESEL',
    re: /\b\d{3}[ -]\d{3}[ -]\d{3}[ -]\d{2}\b|\b\d{6}[ -]?\d{5}\b/g,
    label: PESEL_LABEL,
    numeric: true,
    valid: (m, ctx) => validPesel(digitsOf(m), ctx.now),
  },
  {
    kind: 'NIP',
    re: /\b(?:PL ?)?(?:\d{3}[ -]\d{3}[ -]\d{2}[ -]\d{2}|\d{3}[ -]\d{2}[ -]\d{2}[ -]\d{3}|\d{10})\b/gi,
    label:
      /(?:\bnip|nr\s+identyfikacyjn\w+\s+podatkow\w+|numer\w*\s+identyfikac\w+\s+podatkow\w+)\W{0,10}$/i,
    requireLabel: true,
    numeric: true,
    validLabeled: (m) => validNip(digitsOf(m)),
  },
  {
    kind: 'REGON',
    re: /\b\d{14}\b|\b\d{9}\b/g,
    label: /\bregon\W{0,10}$/i,
    requireLabel: true,
    numeric: true,
    validLabeled: (m) => validRegon(m),
  },
  {
    kind: 'PASZPORT',
    re: /\b[A-Z]{2} ?\d{7}\b/g,
    label: /paszport\w*\W{0,15}$/i,
    requireLabel: true,
  },
  {
    kind: 'DOWOD',
    re: /\b[A-Z]{3} ?\d{6}\b/g,
    label: /(?:dow[oó]d\w*|nr\s+dowodu)\W{0,15}(?:osobist\w*\W{0,5})?$/i,
    valid: (m) => validIdCard(m),
  },
  {
    kind: 'IP',
    re: /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.]*\d)/g,
    valid: (m, ctx) => isIP(m) === 4 && !/(?:\bv|wersj\w*|version)\s?$/i.test(ctx.before),
  },
  {
    kind: 'IP',
    re: /(?<![\w:])[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?![\w:])/gi,
    valid: (m) => isIP(m) === 6 && (/[a-f]/i.test(m) || m.includes('::')),
  },
  // Telefon PL: +48 / 0048 i 9 cyfr, z separatorami lub bez; bez dłuższych ciągów cyfr.
  {
    kind: 'TELEFON',
    re: /(?:(?:\+|00)48[ -]?|(?<!\d[ .,]?))\b[1-9]\d{2}[ -]?\d{3}[ -]?\d{3}\b(?![ .,]?\d)/g,
    numeric: true,
  },
  {
    kind: 'TELEFON',
    re: /(?:(?:\+|00)48[ -]?)?\(?\b\d{2}\)?[ -]\d{3}[ -]\d{2}[ -]\d{2}\b(?![ .,]?\d)/g,
    numeric: true,
  },
];

function applyRules(
  segment: string,
  now: Date,
  found: Set<PiiKind>,
  only?: ReadonlySet<PiiKind>,
): string {
  let out = segment;
  for (const rule of RULES) {
    if (only && !only.has(rule.kind)) continue;
    out = out.replace(rule.re, (m: string, ...rest: unknown[]) => {
      const offset = rest.find((r) => typeof r === 'number') as number;
      const full = rest.find((r) => typeof r === 'string') as string;
      const ctx: Ctx = {
        before: full.slice(Math.max(0, offset - 40), offset),
        after: full.slice(offset + m.length, offset + m.length + 8),
        now,
      };
      const labeled = rule.label?.test(ctx.before) ?? false;
      let mask: boolean;
      if (labeled) {
        mask = rule.validLabeled ? rule.validLabeled(m, ctx) : true;
      } else if (rule.requireLabel) {
        mask = false;
      } else {
        const isAmount =
          rule.numeric === true && (AMOUNT_AFTER.test(ctx.after) || AMOUNT_BEFORE.test(ctx.before));
        mask = !isAmount && (rule.valid ? rule.valid(m, ctx) : true);
      }
      if (!mask) return m;
      found.add(rule.kind);
      return `[${rule.kind}]`;
    });
  }
  return out;
}

// ---------- adresy URL ----------

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRACKING_PARAM =
  /^(?:utm_.*|fbclid|gclid|token|access_token|key|api_key|email|e-mail|phone|tel|session|sessionid|sid)$/i;
const PII_IN_PARAM = new Set<PiiKind>(['EMAIL', 'TELEFON', 'PESEL']);

/**
 * Oczyszcza URL dla modelu i zapisu: usuwa parametry śledzące i tokeny oraz parametry,
 * których wartość zawiera e-mail, telefon lub PESEL. Ścieżka zostaje bez zmian
 * (numery artykułów to nie dane osobowe). Pobieranie strony używa oryginału.
 */
export function sanitizeUrl(raw: string, now = new Date()): { url: string; found: PiiKind[] } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { url: raw, found: [] };
  }
  const found = new Set<PiiKind>();
  // Kopia, bo w pętli usuwamy parametry.
  for (const [name, value] of Array.from(url.searchParams)) {
    if (TRACKING_PARAM.test(name)) {
      url.searchParams.delete(name);
      continue;
    }
    const kinds = new Set<PiiKind>();
    if (applyRules(value, now, kinds, PII_IN_PARAM) !== value) {
      url.searchParams.delete(name);
      for (const k of kinds) found.add(k);
    }
  }
  if (url.username || url.password) {
    url.username = '';
    url.password = '';
  }
  // Zachowujemy oryginalny zapis, jeśli nic nie usunięto (URL normalizuje np. końcowy „/”).
  const cleaned = url.toString();
  const unchanged = new URL(raw).toString() === cleaned;
  return { url: unchanged ? raw : cleaned, found: [...found] };
}

/** Maskuje dane osobowe w tekście. Adresy URL: ścieżka bez zmian, query oczyszczone. */
export function maskPii(text: string, now = new Date()): { text: string; found: PiiKind[] } {
  const found = new Set<PiiKind>();
  let result = '';
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    result += applyRules(text.slice(last, m.index), now, found);
    const clean = sanitizeUrl(m[0], now);
    for (const k of clean.found) found.add(k);
    result += clean.url;
    last = m.index + m[0].length;
  }
  result += applyRules(text.slice(last), now, found);
  return { text: result, found: [...found] };
}
