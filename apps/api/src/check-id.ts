import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** 10 znaków z 62 to ok. 59 bitów losowości: link jest krótki, a wyniku nie da się zgadnąć. */
export const CHECK_ID_LENGTH = 10;
// Największa wielokrotność 62 mieszcząca się w bajcie: odrzucamy resztę, żeby każdy znak był równie prawdopodobny.
const LIMIT = 256 - (256 % ALPHABET.length);

/** Losowy, krótki identyfikator sprawdzenia. Wynik zawiera treść zgłoszenia, więc musi być nie do zgadnięcia. */
export function newCheckId(): string {
  let id = '';
  while (id.length < CHECK_ID_LENGTH) {
    for (const byte of randomBytes(CHECK_ID_LENGTH * 2)) {
      if (byte >= LIMIT) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === CHECK_ID_LENGTH) break;
    }
  }
  return id;
}
