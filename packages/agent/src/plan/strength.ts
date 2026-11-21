import type { Confidence, Evidence, Verdict } from '@prawdowid/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;
const CURRENT_DAYS = 365;

export type Strength = { confidence: Confidence; reasons: string[] };

/**
 * Siła podstawy odpowiedzi liczona z jawnych przesłanek (wymóg zadania), a nie z pewności modelu:
 * liczba niezależnych wydawców, typ źródła, aktualność i zgodność źródeł. Tabela: docs/agent.md.
 */
export function computeStrength(input: {
  verdict: Verdict;
  basis: readonly Evidence[];
  discrepancy: boolean;
  now: Date;
}): Strength {
  const { verdict, basis, discrepancy, now } = input;

  if (verdict === 'nie podlega weryfikacji') {
    return {
      confidence: 'niska',
      reasons: ['To opinia, ocena albo prognoza: nie da się jej sprawdzić w źródłach.'],
    };
  }
  if (basis.length === 0) {
    return {
      confidence: 'niska',
      reasons: ['Brak materiału, który wprost dotyczy twierdzenia.'],
    };
  }

  const reasons: string[] = [];

  const publishers = [...new Map(basis.map((e) => [publisherKey(e), e.publisher])).values()];
  reasons.push(`${sourcesLabel(publishers.length)}: ${publishers.join(', ')}.`);

  const hasPrimary = basis.some((e) => e.sourceType === 'primary');
  reasons.push(
    hasPrimary
      ? 'W tym źródło urzędowe lub pierwotne.'
      : 'Tylko źródła wtórne (np. serwisy fact-checkingowe).',
  );

  const newest = newestDate(basis);
  let current = false;
  if (newest === null) {
    reasons.push('Materiały nie mają daty publikacji ani pobrania.');
  } else {
    const ageDays = (now.getTime() - newest.time) / DAY_MS;
    current = ageDays <= CURRENT_DAYS;
    const what = newest.published ? 'Najnowszy materiał' : 'Najnowszy materiał (data pobrania)';
    if (ageDays <= RECENT_DAYS) reasons.push(`${what} z ostatnich ${RECENT_DAYS} dni.`);
    else if (current) reasons.push(`${what} z ostatniego roku.`);
    else reasons.push('Materiały są starsze niż rok i mogą być nieaktualne.');
  }

  if (discrepancy) reasons.push('Źródła podają rozbieżne informacje.');

  let confidence: Confidence = 'niska';
  if (!discrepancy && current) {
    if (publishers.length >= 2 && hasPrimary) confidence = 'wysoka';
    else if (publishers.length >= 2 || hasPrimary) confidence = 'średnia';
  }
  return { confidence, reasons };
}

function publisherKey(e: Evidence): string {
  return e.publisher.trim().toLowerCase();
}

function sourcesLabel(n: number): string {
  if (n === 1) return '1 źródło';
  const lastTwo = n % 100;
  const last = n % 10;
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
  return `${n} ${few ? 'niezależne źródła' : 'niezależnych źródeł'}`;
}

/** Data publikacji, a gdy jej brak (np. strona informacyjna bez daty), data pobrania. */
function newestDate(basis: readonly Evidence[]): { time: number; published: boolean } | null {
  let best: { time: number; published: boolean } | null = null;
  for (const e of basis) {
    const published = e.publishedAt !== null;
    const time = Date.parse(e.publishedAt ?? e.fetchedAt ?? '');
    if (!Number.isFinite(time)) continue;
    if (best === null || time > best.time) best = { time, published };
  }
  return best;
}
