import type { Evidence, EvidenceUse, Verdict } from '@prawdowid/contracts';

import { evidenceText, quoteAppearsIn } from './quote.ts';
import type { Judgement } from './schemas.ts';

export type GuardedClaim = {
  verdict: Verdict;
  /** true, gdy kod zmienił werdykt zaproponowany przez sędziego. */
  downgraded: boolean;
  evidenceUse: EvidenceUse[];
  /** Dowody, na których opiera się werdykt: z nich liczona jest siła podstawy. */
  basis: Evidence[];
  discrepancy: boolean;
  /** Czy jakikolwiek materiał z potwierdzonym cytatem dotyczy twierdzenia wprost. */
  hasDirect: boolean;
  /** Dowody, w których sędzia zauważył polecenia skierowane do systemu. */
  flagged: string[];
  notes: string[];
};

type Kept = EvidenceUse & { evidence: Evidence; direct: boolean };

/**
 * Reguły, których model nie może obejść (opis: docs/agent.md).
 * Werdykt rozstrzygający musi mieć oparcie w materiale, który dotyczy twierdzenia wprost
 * i którego cytat faktycznie znajduje się w tekście źródła.
 */
export function applyGuardrails(
  judgement: Judgement,
  available: ReadonlyMap<string, Evidence>,
): GuardedClaim {
  const notes: string[] = [];
  const flagged: string[] = [];
  const kept = new Map<string, Kept>();

  for (const item of judgement.items) {
    const evidence = available.get(item.id);
    if (!evidence) {
      notes.push(`Pominięto odwołanie do nieistniejącego dowodu: ${item.id}.`);
      continue;
    }
    if (kept.has(item.id)) continue;
    if (item.addressesModel) flagged.push(item.id);
    if (item.relation === 'unrelated') continue;

    const quoteOk = item.quote.trim() !== '' && quoteAppearsIn(item.quote, evidenceText(evidence));
    const direct = item.relation === 'direct' && quoteOk;

    if (item.stance !== 'context' && !quoteOk) {
      notes.push(`Pominięto materiał „${evidence.title}”: przytoczonego fragmentu w nim nie ma.`);
      continue;
    }
    kept.set(item.id, {
      id: item.id,
      // Materiał z tego samego tematu, ale o innej sprawie, może tylko uzupełniać kontekst.
      stance: item.relation === 'direct' ? item.stance : 'context',
      quote: quoteOk ? item.quote.trim() : '',
      evidence,
      direct,
    });
  }

  const items = [...kept.values()];
  const directItems = items.filter((i) => i.direct);
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
    notes.push('Żaden materiał z potwierdzonym cytatem nie rozstrzyga tego twierdzenia wprost.');
  }

  return {
    verdict,
    downgraded,
    evidenceUse: items.map(({ id, stance, quote }) => ({ id, stance, quote })),
    basis: basisFor[verdict].map((i) => i.evidence),
    discrepancy: supports.length > 0 && refutes.length > 0,
    hasDirect: directItems.length > 0,
    flagged,
    notes,
  };
}
