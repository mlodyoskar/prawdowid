import type { VerifyMetrics } from '@prawdowid/agent';

export type ModelPrice = { inputPerMTok: number; outputPerMTok: number };

/**
 * Koszt sprawdzenia w USD z liczby tokenów i cennika modelu.
 * Brak cennika albo brak danych o tokenach = `undefined` (koszt nieznany, a nie zerowy).
 * W trybie `plan` z osobnym modelem sędziego to przybliżenie: liczymy wszystko po cenie LLM_MODEL.
 */
export function estimateCostUsd(
  usage: VerifyMetrics['usage'],
  price: ModelPrice | null,
): number | undefined {
  if (!price || !usage) return undefined;
  const { inputTokens, outputTokens } = usage;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const usd =
    ((inputTokens ?? 0) * price.inputPerMTok + (outputTokens ?? 0) * price.outputPerMTok) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
