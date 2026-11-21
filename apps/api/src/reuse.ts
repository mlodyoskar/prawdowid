import { createHash } from 'node:crypto';

import { maskPii, type VerifyResult } from '@prawdowid/agent';
import type { CheckRequest, CheckResponse } from '@prawdowid/contracts';

/**
 * Ponowne użycie wyniku: to samo zgłoszenie (po normalizacji) w ciągu okna ważności dostaje
 * dokładnie ten sam werdykt i te same dowody, niezależnie od kanału (opis: docs/agent.md).
 * Model językowy nie daje powtarzalnych wyników nawet przy temperaturze 0, więc bez tego
 * dwa kanały albo dwa powtórzenia to dwa niezależne losowania planu zapytań.
 */

/**
 * Klucz zgłoszenia. Tekst jest najpierw maskowany (dane osobowe nie trafiają nawet do skrótu),
 * potem normalizowany: Unicode NFC, małe litery, zwinięte białe znaki. Obraz wchodzi skrótem bajtów,
 * więc zrzut przekompresowany przez komunikator to inne zgłoszenie. `salt` niesie konfigurację,
 * od której zależy wynik (tryb, model, temperatura, wersja korpusu): jej zmiana unieważnia klucze.
 */
export function reuseKey(input: CheckRequest, salt: string): string {
  const text = input.text
    ? maskPii(input.text).text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
    : '';
  const image = input.image
    ? createHash('sha256').update(input.image.mediaType).update(input.image.data).digest('hex')
    : '';
  return createHash('sha256')
    .update(JSON.stringify([salt, text, image]))
    .digest('hex');
}

/**
 * Wynik nadaje się do ponownego użycia tylko wtedy, gdy jest pełnym wynikiem merytorycznym.
 * Awaria, prośba o doprecyzowanie, wynik częściowy (niedostępne źródło, nieodczytana strona,
 * przerwana runda doczytania) nigdy nie są utrwalane: następne zgłoszenie sprawdzamy od nowa.
 */
export function isReusable({ response, metrics }: VerifyResult): boolean {
  if (response.status !== 'ok') return false;
  if ((response.unchecked?.length ?? 0) > 0) return false;
  if (metrics.sourceFailures > 0 || metrics.pages.failed > 0) return false;
  // Tryb `plan` liczy przerwane rundy doczytania i poprawy: wynik opiera się wtedy na pierwszej ocenie.
  return !(
    'refineErrors' in metrics &&
    typeof metrics.refineErrors === 'number' &&
    metrics.refineErrors > 0
  );
}

/**
 * Kopia wyniku dla nowego zgłoszenia. Ma własny numer i czas, a `reusedFrom` mówi uczciwie,
 * kiedy wykonano właściwe sprawdzenie. Numeru tamtego sprawdzenia nie ujawniamy:
 * pozwalałby odczytać albo usunąć cudzą sesję.
 */
export function reuseResponse(
  source: CheckResponse,
  checkId: string,
  createdAt: Date,
): CheckResponse {
  if (source.status !== 'ok') throw new Error('Only ok results can be reused');
  return {
    ...source,
    checkId,
    createdAt: createdAt.toISOString(),
    durationMs: 0,
    reusedFrom: { createdAt: source.reusedFrom?.createdAt ?? source.createdAt },
  };
}
