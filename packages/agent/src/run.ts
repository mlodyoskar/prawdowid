import type { CheckRequest, ResearchMode } from '@prawdowid/contracts';

import {
  matchIncidents,
  withIncidents,
  type EarlyIncidents,
  type IncidentSearch,
} from './incidents.ts';
import { verifyPlanned, type PlanDeps, type PlanOptions } from './verify-planned.ts';
import { verify, type VerifyResult } from './verify.ts';

export type RunOptions = PlanOptions & {
  mode: ResearchMode;
  /** Limit całego sprawdzenia; dopasowanie do incydentów nie może go przekroczyć. */
  jobTimeoutMs?: number;
};

export type RunDeps = PlanDeps & {
  /** Katalog znanych incydentów (EUvsDisinfo). Brak = krok dopasowania jest pomijany. */
  incidents?: IncidentSearch;
};

/**
 * Jedno wejście do weryfikacji dla wszystkich kanałów. Tryb wybiera konfiguracja,
 * więc WWW i drugi kanał zawsze przechodzą tę samą ścieżkę (opis trybów: docs/agent.md).
 * Dopasowanie do znanych incydentów nie widzi dowodów ani werdyktu i niczego w nich nie zmienia.
 */
export async function runVerification(
  input: CheckRequest,
  deps: RunDeps,
  options: RunOptions,
): Promise<VerifyResult> {
  const incidentDeps = deps.incidents ? { search: deps.incidents, model: deps.model } : undefined;
  const shared = {
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  };

  // W trybie `plan` dopasowanie startuje, gdy twierdzenia są wydzielone, i biegnie równolegle
  // z wyszukiwaniem i sędzią, więc nie wydłuża odpowiedzi. Do katalogu trafiają tylko twierdzenia.
  let precomputed: Promise<EarlyIncidents> | undefined;
  const planOptions: PlanOptions = incidentDeps
    ? {
        ...options,
        onClaims: (claims) => {
          options.onClaims?.(claims);
          precomputed = matchIncidents(claims, incidentDeps, shared).then((outcome) => ({
            claims,
            outcome,
          }));
        },
      }
    : options;

  const result =
    options.mode === 'plan'
      ? await verifyPlanned(input, deps, planOptions)
      : await verify(input, deps, options);
  if (!incidentDeps) return result;
  return withIncidents(result, incidentDeps, {
    ...shared,
    ...(options.jobTimeoutMs === undefined ? {} : { jobTimeoutMs: options.jobTimeoutMs }),
    ...(precomputed ? { precomputed } : {}),
  });
}
