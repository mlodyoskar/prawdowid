import assert from 'node:assert/strict';
import { test } from 'node:test';

import { count, formatDate, hostname, isWebUrl, plural } from './format.ts';

const CLAIM = ['twierdzenie', 'twierdzenia', 'twierdzeń'] as const;

test('plural follows Polish rules', () => {
  assert.equal(plural(0, CLAIM), 'twierdzeń');
  assert.equal(plural(1, CLAIM), 'twierdzenie');
  assert.equal(plural(2, CLAIM), 'twierdzenia');
  assert.equal(plural(4, CLAIM), 'twierdzenia');
  assert.equal(plural(5, CLAIM), 'twierdzeń');
  assert.equal(plural(12, CLAIM), 'twierdzeń');
  assert.equal(plural(14, CLAIM), 'twierdzeń');
  assert.equal(plural(22, CLAIM), 'twierdzenia');
  assert.equal(plural(112, CLAIM), 'twierdzeń');
  assert.equal(count(3, CLAIM), '3 twierdzenia');
});

test('formatDate uses Polish format in Warsaw time and rejects bad input', () => {
  assert.equal(formatDate('2026-11-20T23:30:00Z'), '21.11.2026');
  assert.equal(formatDate(null), null);
  assert.equal(formatDate('nie data'), null);
});

test('hostname and isWebUrl', () => {
  assert.equal(hostname('https://www.gov.pl/web/dyplomacja'), 'gov.pl');
  assert.equal(hostname('ftp://archiwum.example/1'), 'archiwum.example');
  assert.equal(isWebUrl('https://nato.int'), true);
  assert.equal(isWebUrl('ftp://archiwum.example/1'), false);
  assert.equal(isWebUrl('javascript:alert(1)'), false);
});
