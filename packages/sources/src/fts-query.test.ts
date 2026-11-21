import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toFtsQuery } from './fts-query.ts';

test('ucina długie słowa do prefiksu i łączy przez OR', () => {
  assert.equal(toFtsQuery('szczepionki grypa'), '"szczep"* OR "gryp"*');
});

test('krótkie słowa bez prefiksu, stopwords i słowa < 3 znaków pomijane', () => {
  assert.equal(toFtsQuery('Czy to jest A4 lub woda?'), '"woda"');
});

test('pusty lub sam szum daje null', () => {
  assert.equal(toFtsQuery(''), null);
  assert.equal(toFtsQuery('czy to jest?!'), null);
});

test('cudzysłowy i operatory FTS z wejścia nie przechodzą do zapytania', () => {
  const q = toFtsQuery('woda" OR NEAR(x) *');
  assert.equal(q, '"woda" OR "near"');
});
