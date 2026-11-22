import type { Evidence, EvidenceUse, Verdict } from '@prawdowid/contracts';

import { isVerifiedQuote } from './quote.ts';
import type { Judgement } from './schemas.ts';

export type GuardedClaim = {
  verdict: Verdict;
  /** true, gdy kod zmienił werdykt zaproponowany przez sędziego. */
  downgraded: boolean;
  evidenceUse: EvidenceUse[];
  /**
   * Materiały z tego samego tematu, ale o innej sprawie. Nie są cytatami ani dowodem:
   * pokazujemy je osobno, z samym tytułem i linkiem.
   */
  relatedIds: string[];
  /** Dowody, na których opiera się werdykt: z nich liczona jest siła podstawy. */
  basis: Evidence[];
  discrepancy: boolean;
  /** Czy jakikolwiek materiał z potwierdzonym cytatem dotyczy twierdzenia wprost. */
  hasDirect: boolean;
  /** Dowody, w których sędzia zauważył polecenia skierowane do systemu. */
  flagged: string[];
  /** Materiały związane z twierdzeniem, które odrzuciliśmy, bo zawierają polecenia dla systemu. */
  quarantined: string[];
  notes: string[];
};

type Kept = EvidenceUse & { evidence: Evidence };

/** Materiały z tego samego tematu, ale o innej sprawie: pokazujemy najwyżej tyle na twierdzenie. */
const MAX_RELATED = 2;

/**
 * Reguły, których model nie może obejść (opis: docs/agent.md).
 * Werdykt rozstrzygający musi mieć oparcie w materiale, który dotyczy twierdzenia wprost
 * i którego cytat faktycznie znajduje się w tekście źródła.
 */
export function applyGuardrails(
  judgement: Judgement,
  available: ReadonlyMap<string, Evidence>,
  /** Dowody, w których polecenia dla systemu wykrył kod (wzorce). */
  suspect: ReadonlySet<string> = new Set(),
): GuardedClaim {
  const notes: string[] = [];
  const flagged: string[] = [];
  const quarantined: string[] = [];
  const kept = new Map<string, Kept>();
  const related = new Map<string, Evidence>();

  for (const item of judgement.items) {
    const evidence = available.get(item.id);
    if (!evidence) {
      notes.push(`Pominięto odwołanie do nieistniejącego dowodu: ${item.id}.`);
      continue;
    }
    if (kept.has(item.id) || related.has(item.id)) continue;
    if (item.addressesModel) flagged.push(item.id);
    if (item.relation === 'unrelated') continue;

    // Materiał z poleceniami dla systemu nie jest dowodem, niezależnie od tego, co „twierdzi”.
    if (item.addressesModel || suspect.has(item.id)) {
      quarantined.push(item.id);
      notes.push(
        `Pominięto materiał „${evidence.title}”: zawiera polecenia skierowane do systemu.`,
      );
      continue;
    }

    // Inna sprawa z tego samego tematu: nie jest cytatem przy twierdzeniu ani dowodem.
    // Trafia do osobnej listy „inne materiały na ten temat”, bez fragmentu i bez roli.
    if (item.relation === 'related') {
      if (related.size < MAX_RELATED) related.set(item.id, evidence);
      continue;
    }

    // Bez potwierdzonego cytatu materiał nie trafia do wyniku, także jako kontekst.
    if (!isVerifiedQuote(item.quote, evidence)) {
      if (item.stance !== 'context') {
        notes.push(`Pominięto materiał „${evidence.title}”: przytoczonego fragmentu w nim nie ma.`);
      }
      continue;
    }
    kept.set(item.id, {
      id: item.id,
      stance: item.stance,
      // «» to znaczniki trafień z wyszukiwarki, nie część materiału.
      quote: item.quote.replace(/[«»]/g, '').trim(),
      evidence,
    });
  }

  const directItems = trimContext([...kept.values()]);
  // Dokument, który dotyczy sprawy wprost, nie powtarza się na liście innych materiałów.
  const citedUrls = new Set(directItems.map((i) => i.evidence.url));
  const relatedIds = [...related.values()]
    .filter((e, i, all) => !citedUrls.has(e.url) && all.findIndex((x) => x.url === e.url) === i)
    .map((e) => e.id);
  const supports = directItems.filter((i) => i.stance === 'supports');
  const refutes = directItems.filter((i) => i.stance === 'refutes');

  const basisFor: Record<Verdict, Kept[]> = {
    potwierdzone: supports,
    fałszywe: refutes,
    'wprowadzające w błąd': directItems,
    'brak wystarczających dowodów': [],
    'nie podlega weryfikacji': [],
  };
  const proposed = judgement.verdict;
  const needsBasis =
    proposed === 'potwierdzone' || proposed === 'fałszywe' || proposed === 'wprowadzające w błąd';
  const downgraded = needsBasis && basisFor[proposed].length === 0;
  const verdict: Verdict = downgraded ? 'brak wystarczających dowodów' : proposed;
  if (downgraded) {
    notes.push(
      directItems.length > 0
        ? 'Ocena modelu nie zgadzała się z rolą przytoczonych materiałów, więc jej nie przyjęliśmy.'
        : 'Żaden materiał z potwierdzonym cytatem nie rozstrzyga tego twierdzenia wprost.',
    );
  }

  return {
    verdict,
    downgraded,
    // Najpierw materiały, które wspierają albo obalają twierdzenie, potem kontekst: pierwsze źródło
    // w WWW i w skróconej odpowiedzi WhatsApp to zawsze podstawa werdyktu, nie przypadkowy kontekst.
    evidenceUse: directItems
      .toSorted((a, b) => Number(a.stance === 'context') - Number(b.stance === 'context'))
      .map(({ id, stance, quote }) => ({ id, stance, quote })),
    relatedIds,
    basis: basisFor[verdict].map((i) => i.evidence),
    discrepancy: supports.length > 0 && refutes.length > 0,
    hasDirect: directItems.length > 0,
    flagged,
    quarantined,
    notes,
  };
}

/**
 * Jeden dokument może dać kilka fragmentów. Do wyniku trafiają te, które coś rozstrzygają,
 * a gdy żaden nie rozstrzyga: jeden fragment kontekstu na dokument.
 */
function trimContext(items: Kept[]): Kept[] {
  const deciding = new Set(items.filter((i) => i.stance !== 'context').map((i) => i.evidence.url));
  const withContext = new Set<string>();
  return items.filter((item) => {
    if (item.stance !== 'context') return true;
    const url = item.evidence.url;
    if (deciding.has(url) || withContext.has(url)) return false;
    withContext.add(url);
    return true;
  });
}
