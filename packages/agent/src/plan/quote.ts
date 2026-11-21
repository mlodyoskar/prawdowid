import type { Evidence } from '@prawdowid/contracts';

/** Krótsze fragmenty niczego nie dowodzą (pasowałyby prawie do każdego tekstu). */
const MIN_PART_LENGTH = 3;
/** Cały cytat musi mieć co najmniej tyle znaków: samo „MON” albo „nie” to nie dowód. */
const MIN_QUOTE_LENGTH = 12;

/** Tekst dowodu, z którego sędzia może cytować: to samo, co widzi w wyniku wyszukiwania. */
export function evidenceText(e: Evidence): string {
  return [e.title, e.excerpt, e.rating ?? ''].join('\n');
}

/** Ujednolica zapis, żeby cytat nie odpadał przez cudzysłowy, spacje czy znaczniki trafień FTS. */
export function normalizeForQuote(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[«»„”“"'’‘`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Czy cytat ma pokrycie w dowodzie: jest dosłownym fragmentem jego treści
 * albo dokładnie oceną wystawioną przez fact-checkera (np. „Fałsz”).
 */
export function isVerifiedQuote(quote: string, e: Evidence): boolean {
  if (quote.trim() === '') return false;
  if (e.rating && normalizeForQuote(quote) === normalizeForQuote(e.rating)) return true;
  return quoteAppearsIn(quote, evidenceText(e));
}

/**
 * Czy cytat rzeczywiście występuje w materiale. Wielokropek dzieli cytat na części,
 * które muszą wystąpić w materiale w tej samej kolejności.
 */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const haystack = normalizeForQuote(source);
  const parts = quote
    .split(/…|\.{3}|\[\.\.\.\]/)
    .map((part) => normalizeForQuote(part).replace(/[.,;:]+$/, ''))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return false;
  if (parts.reduce((sum, part) => sum + part.length, 0) < MIN_QUOTE_LENGTH) return false;

  let from = 0;
  for (const part of parts) {
    if (part.length < MIN_PART_LENGTH) return false;
    const at = haystack.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}
