import type { Evidence } from '@prawdowid/contracts';

/** Trafienie ze źródła, zanim agent nada mu id. */
export type SourceHit = Omit<Evidence, 'id'>;

export type SourceFailureReason = 'missing_key' | 'rate_limited' | 'unavailable';

/**
 * Wynik wyszukiwania w źródle. Źródła nie rzucają wyjątków: awarię zwracają jako `ok: false`,
 * żeby agent wiedział, że źródło było niedostępne, i nie udawał wyniku.
 */
export type SourceResult =
  | { ok: true; items: SourceHit[] }
  | { ok: false; reason: SourceFailureReason; message: string };
