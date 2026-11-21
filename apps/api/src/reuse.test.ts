import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyMetrics, type VerifyMetrics } from '@prawdowid/agent';
import type { CheckResponse } from '@prawdowid/contracts';

import { isReusable, reuseKey, reuseResponse } from './reuse.ts';

const ok: CheckResponse = {
  checkId: 'a',
  createdAt: '2026-11-21T10:00:00.000Z',
  durationMs: 9000,
  status: 'ok',
  summary: 's',
  claims: [],
  evidence: [],
  warnings: [],
};

test('klucz: białe znaki i wielkość liter nie zmieniają zgłoszenia, treść i konfiguracja tak', () => {
  const a = reuseKey({ text: 'GIS ostrzegł  przed kubkiem.' }, 's');
  assert.equal(reuseKey({ text: ' gis ostrzegł przed\nkubkiem. ' }, 's'), a);
  assert.notEqual(reuseKey({ text: 'GIS ostrzegł przed talerzem.' }, 's'), a);
  assert.notEqual(reuseKey({ text: 'GIS ostrzegł przed kubkiem.' }, 'inny model'), a);
  const image = { mediaType: 'image/png' as const, data: 'AAAA' };
  assert.notEqual(reuseKey({ text: 'GIS ostrzegł przed kubkiem.', image }, 's'), a);
  assert.notEqual(
    reuseKey({ image: { mediaType: 'image/png', data: 'AAAB' } }, 's'),
    reuseKey({ image }, 's'),
  );
});

test('klucz: dane osobowe są maskowane przed liczeniem skrótu', () => {
  assert.equal(
    reuseKey({ text: 'Napisz na jan@example.com' }, 's'),
    reuseKey({ text: 'Napisz na ewa@example.com' }, 's'),
  );
});

test('do ponownego użycia tylko pełny wynik merytoryczny', () => {
  const metrics = emptyMetrics();
  assert.equal(isReusable({ response: ok, metrics }), true);
  const error: CheckResponse = { ...ok, status: 'error', code: 'llm_unavailable', message: 'x' };
  assert.equal(isReusable({ response: error, metrics }), false);
  const unclear: CheckResponse = { ...ok, status: 'needs_clarification', message: 'x' };
  assert.equal(isReusable({ response: unclear, metrics }), false);
  const partial = { ...ok, unchecked: [{ claim: 'c', reason: 'r' }] };
  assert.equal(isReusable({ response: partial, metrics }), false);
  assert.equal(isReusable({ response: ok, metrics: { ...metrics, sourceFailures: 1 } }), false);
  assert.equal(
    isReusable({ response: ok, metrics: { ...metrics, pages: { fetched: 0, failed: 1 } } }),
    false,
  );
  const refine = { ...metrics, refineErrors: 1 } as VerifyMetrics;
  assert.equal(isReusable({ response: ok, metrics: refine }), false);
});

test('kopia ma własny numer i czas, wskazuje czas pierwszego sprawdzenia, nie jego numer', () => {
  const copy = reuseResponse(ok, 'b', new Date('2026-11-21T11:00:00Z'));
  assert.equal(copy.checkId, 'b');
  assert.equal(copy.createdAt, '2026-11-21T11:00:00.000Z');
  assert.ok(copy.status === 'ok');
  assert.deepEqual(copy.reusedFrom, { createdAt: ok.createdAt });
  assert.ok(!JSON.stringify(copy).includes('"a"'));
  const second = reuseResponse(copy, 'c', new Date('2026-11-21T12:00:00Z'));
  assert.ok(second.status === 'ok');
  assert.deepEqual(second.reusedFrom, { createdAt: ok.createdAt });
});
