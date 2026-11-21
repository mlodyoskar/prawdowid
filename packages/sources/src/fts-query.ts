/**
 * Zamienia pytanie w zapytanie FTS5 odporne na polską fleksję bez stemmera:
 * słowa od 5 znaków ucinamy do prefiksu (`szczepionki` → `"szczep"*`), więc pasują ich odmiany.
 * Diakrytyki zdejmuje tokenizer (`remove_diacritics 2`), tu tylko normalizujemy wielkość liter.
 */

const PREFIX_LENGTH = 6;
const MIN_TOKEN_LENGTH = 3;
const MIN_PREFIX_SOURCE = 5;
const MAX_TOKENS = 16;

const STOPWORDS = new Set([
  'aby',
  'albo',
  'ale',
  'bez',
  'być',
  'był',
  'była',
  'było',
  'były',
  'czy',
  'dla',
  'gdy',
  'jak',
  'jaki',
  'jest',
  'już',
  'jego',
  'jej',
  'ich',
  'lub',
  'może',
  'nad',
  'nie',
  'ona',
  'oni',
  'ono',
  'oraz',
  'pod',
  'przez',
  'przy',
  'się',
  'tak',
  'też',
  'tego',
  'tej',
  'ten',
  'to',
  'tym',
  'też',
  'który',
  'która',
  'które',
  'którzy',
  'więc',
  'właśnie',
  'czyli',
  'jeśli',
  'żeby',
  'które',
  'prawda',
  'czym',
  'gdzie',
  'kiedy',
  'co',
  'że',
  'and',
  'the',
  'for',
  'with',
]);

export function toFtsQuery(text: string): string | null {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_TOKEN_LENGTH || STOPWORDS.has(raw)) continue;
    // Od 5 znaków odcinamy końcówkę fleksyjną: `pobór` → `pobó*` (pasuje `poboru`), `szczepionki` → `szczep*`.
    const term =
      raw.length >= MIN_PREFIX_SOURCE
        ? `"${raw.slice(0, Math.min(PREFIX_LENGTH, raw.length - 1))}"*`
        : `"${raw}"`;
    seen.add(term);
    if (seen.size >= MAX_TOKENS) break;
  }
  return seen.size === 0 ? null : [...seen].join(' OR ');
}
