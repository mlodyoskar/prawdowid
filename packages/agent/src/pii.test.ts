import assert from 'node:assert/strict';
import { test } from 'node:test';

import { maskPii, sanitizeUrl, validPesel } from './pii.ts';

const NOW = new Date('2026-11-21T12:00:00Z');
const mask = (text: string) => maskPii(text, NOW);

/** Wszystkie numery poniżej są syntetyczne (wygenerowane pod sumy kontrolne). */
test('maskuje dane osobowe (przypadki pozytywne)', () => {
  const cases: Array<[string, string, string]> = [
    ['Pisz na jan.kowalski@example.com', 'Pisz na [EMAIL]', 'EMAIL'],
    ['Zadzwoń +48 600 123 456', 'Zadzwoń [TELEFON]', 'TELEFON'],
    ['tel. 600123456', 'tel. [TELEFON]', 'TELEFON'],
    ['tel. 22 123 45 67', 'tel. [TELEFON]', 'TELEFON'],
    ['tel. 48600123456', 'tel. [TELEFON]', 'TELEFON'],
    ['PESEL 44051401359', 'PESEL [PESEL]', 'PESEL'],
    ['mój numer 44051401359', 'mój numer [PESEL]', 'PESEL'],
    ['urodzony 2002: 02211501235', 'urodzony 2002: [PESEL]', 'PESEL'],
    ['440514 01359', '[PESEL]', 'PESEL'],
    ['440514-01359', '[PESEL]', 'PESEL'],
    ['440 514 013 59', '[PESEL]', 'PESEL'],
    ['PESEL: 44051401358', 'PESEL: [PESEL]', 'PESEL'], // z etykietą nawet zła suma
    ['PESEL 48600123456', 'PESEL [PESEL]', 'PESEL'], // etykieta wygrywa z telefonem
    ['konto PL61 1090 1014 0000 0712 1981 2874', 'konto [IBAN]', 'IBAN'],
    ['konto 61109010140000071219812874', 'konto [IBAN]', 'IBAN'],
    ['karta 4111 1111 1111 1111', 'karta [KARTA]', 'KARTA'],
    ['nr karty 4111111111111111', 'nr karty [KARTA]', 'KARTA'],
    ['NIP 1234563218', 'NIP [NIP]', 'NIP'],
    ['NIP: 123-456-32-18', 'NIP: [NIP]', 'NIP'],
    ['NIP PL1234563218', 'NIP [NIP]', 'NIP'],
    ['REGON 123456785', 'REGON [REGON]', 'REGON'],
    ['REGON: 12345678000012', 'REGON: [REGON]', 'REGON'],
    ['nr paszportu AB1234567', 'nr paszportu [PASZPORT]', 'PASZPORT'],
    ['seria ABA300000', 'seria [DOWOD]', 'DOWOD'],
    // REGON bez etykiety nie jest maskowany jako REGON; 9 cyfr łapie wtedy reguła telefonu (bez zmian).
    ['firma 123456785', 'firma [TELEFON]', 'TELEFON'],
    ['dowód osobisty ABA300001', 'dowód osobisty [DOWOD]', 'DOWOD'], // z etykietą zawsze
    ['księga WA4M/00012345/2', 'księga [KW]', 'KW'],
    ['logowanie z 83.12.45.201', 'logowanie z [IP]', 'IP'],
    ['adres 2001:db8::8a2e:370:7334', 'adres [IP]', 'IP'],
  ];
  for (const [input, expected, kind] of cases) {
    const res = mask(input);
    assert.equal(res.text, expected, input);
    assert.deepEqual(res.found, [kind], input);
  }
});

test('nie maskuje kwot, liczb z twierdzeń, dat ani słabych identyfikatorów bez etykiety', () => {
  const safe = [
    'Rząd przeznaczy 1500000000 zł na obronność.',
    'Straty wyniosły 12345678901 zł.',
    'Budżet: 44051401359', // słowo kwoty przed liczbą
    'Kwota 4111 1111 1111 1111',
    'Polska liczy 37636508 mieszkańców, a Warszawa 1861975 osób.',
    'Inflacja wyniosła 3,1% w październiku 2026.',
    'Data: 2026-11-21, godzina 12:30:45.',
    'Budżet 100 000 000 zł i 120 000 osób.',
    'https://example.com/artykul/600123456/44051401359',
    '30210101231', // PESEL z przyszłości (2030)
    '90023101237', // 31 lutego
    'Wersja v1.2.3.4 i wersja 1.2.3.4',
    'Adres 300.1.2.3 to nie IP',
    'NIP bez etykiety: 1234563218 zostaje? Tylko liczba 1234563218.',
    'Kwota w groszach: 123 456 785 zł.', // 9 cyfr z walutą to nie telefon
    'Karta bez grup i etykiety 4111111111111111',
    'Paszport-podobne AB1234567 bez etykiety',
    'Seria ABA300001 bez etykiety i ze złą sumą',
    'Jan Kowalski z Krakowa, 11 listopada 2026.',
  ];
  for (const text of safe) {
    const res = mask(text);
    assert.equal(res.text, text, text);
    assert.deepEqual(res.found, [], text);
  }
});

test('walidacja PESEL: suma, stulecie, istniejąca data, nie z przyszłości', () => {
  assert.equal(validPesel('44051401359', NOW), true);
  assert.equal(validPesel('02211501235', NOW), true); // 2002 (miesiąc 21–32)
  assert.equal(validPesel('44051401358', NOW), false); // zła suma
  assert.equal(validPesel('90023101237', NOW), false); // 31 lutego
  assert.equal(validPesel('30210101231', NOW), false); // przyszłość
});

test('URL: ścieżka bez zmian, parametry z PII i śledzące usunięte', () => {
  assert.equal(
    sanitizeUrl('https://portal.pl/a/600123456?id=7').url,
    'https://portal.pl/a/600123456?id=7',
  );
  const res = sanitizeUrl(
    'https://portal.pl/a?id=7&email=jan%40example.com&utm_source=fb&fbclid=xyz&q=tel+600123456&token=abc',
    NOW,
  );
  assert.equal(res.url, 'https://portal.pl/a?id=7');
  assert.deepEqual(res.found, ['TELEFON']);

  const text = mask('Zobacz https://portal.pl/x?ref=44051401359&utm_campaign=a i dzwoń 600123456');
  assert.equal(text.text, 'Zobacz https://portal.pl/x i dzwoń [TELEFON]');
  assert.deepEqual(text.found.sort(), ['PESEL', 'TELEFON']);
});
