/** Polish plural form: plural(2, ['twierdzenie', 'twierdzenia', 'twierdzeń']) → 'twierdzenia'. */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  if (n === 1) return one;
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

/** "2 twierdzenia", "5 źródeł". */
export function count(n: number, forms: readonly [string, string, string]): string {
  return `${n} ${plural(n, forms)}`;
}

const dateFmt = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Warsaw',
});
const dateTimeFmt = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Warsaw',
});

/** "20.11.2026". Returns null for a missing or unparseable date. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

/** "21.11.2026, 15:42". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFmt.format(d);
}

/** Host without "www.": "https://www.gov.pl/web/x" → "gov.pl". Falls back to the input. */
export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Only http(s) URLs are rendered as links; anything else stays plain text. */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
