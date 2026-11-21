import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitIntoFragments } from './fragments.ts';

test('krótka treść to jeden fragment, pusta: żaden', () => {
  assert.deepEqual(splitIntoFragments('  Jedno   zdanie.\n'), ['Jedno zdanie.']);
  assert.deepEqual(splitIntoFragments(' \n '), []);
});

test('tnie na granicach zdań i nie przekracza limitu', () => {
  const text = 'Pierwsze zdanie jest tutaj. Drugie zdanie jest tutaj. Trzecie zdanie jest tutaj.';
  const fragments = splitIntoFragments(text, 60);
  assert.deepEqual(fragments, [
    'Pierwsze zdanie jest tutaj. Drugie zdanie jest tutaj.',
    'Trzecie zdanie jest tutaj.',
  ]);
});

test('zdanie dłuższe niż limit jest cięte na spacjach, bez gubienia treści', () => {
  const sentence = Array.from({ length: 40 }, (_, i) => `słowo${i}`).join(' ');
  const fragments = splitIntoFragments(sentence, 50);
  assert.ok(fragments.length > 1);
  assert.ok(fragments.every((fragment) => fragment.length <= 50));
  assert.equal(fragments.join(' '), sentence);
});
