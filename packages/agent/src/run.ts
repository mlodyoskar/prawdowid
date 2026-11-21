import type { CheckRequest, ResearchMode } from '@prawdowid/contracts';

import { verifyPlanned, type PlanDeps, type PlanOptions } from './verify-planned.ts';
import { verify, type VerifyResult } from './verify.ts';

export type RunOptions = PlanOptions & { mode: ResearchMode };

/**
 * Jedno wejście do weryfikacji dla wszystkich kanałów. Tryb wybiera konfiguracja,
 * więc WWW i drugi kanał zawsze przechodzą tę samą ścieżkę (opis trybów: docs/agent.md).
 */
export function runVerification(
  input: CheckRequest,
  deps: PlanDeps,
  options: RunOptions,
): Promise<VerifyResult> {
  return options.mode === 'plan'
    ? verifyPlanned(input, deps, options)
    : verify(input, deps, options);
}
