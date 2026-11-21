import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyMetrics, type VerifyResult } from '@prawdowid/agent';

import { JobRunner, SqliteJobStore, type RunCheck } from './jobs.ts';

const metrics = emptyMetrics();
const okResult = (checkId: string): VerifyResult => ({
  response: {
    checkId,
    createdAt: '2026-11-21T00:00:00Z',
    durationMs: 5,
    status: 'out_of_scope',
    message: 'hej',
  },
  metrics,
});

/** run(), które kończy się dopiero po wywołaniu release(). */
function deferredRun() {
  const pending: Array<() => void> = [];
  const seen: Array<{ checkId: string; signal: AbortSignal; hasImage: boolean }> = [];
  const run: RunCheck = (input, { checkId, abortSignal }) => {
    seen.push({ checkId, signal: abortSignal, hasImage: Boolean(input.image) });
    return new Promise((resolve) => pending.push(() => resolve(okResult(checkId))));
  };
  return { run, seen, releaseAll: () => pending.splice(0).forEach((r) => r()) };
}

const tick = () => new Promise((r) => setImmediate(r));

test('cykl queued → running → done i limit współbieżności', async () => {
  const store = new SqliteJobStore(':memory:');
  const { run, seen, releaseAll } = deferredRun();
  const runner = new JobRunner({ store, run, concurrency: 1, maxQueued: 10, timeoutMs: 5000 });

  const a = runner.enqueue({ text: 'a' });
  const b = runner.enqueue({ text: 'b' });
  assert.ok(a && b);
  assert.equal(store.get(a.checkId)?.state, 'running');
  assert.equal(store.get(b.checkId)?.state, 'queued');
  assert.equal(seen.length, 1);

  releaseAll();
  await tick();
  assert.equal(store.get(a.checkId)?.state, 'done');
  assert.equal(store.get(a.checkId)?.result?.status, 'out_of_scope');
  assert.equal(store.get(b.checkId)?.state, 'running');
  releaseAll();
  await tick();
  assert.equal(store.get(b.checkId)?.state, 'done');
});

test('pełna kolejka → null', () => {
  const store = new SqliteJobStore(':memory:');
  const runner = new JobRunner({
    store,
    run: deferredRun().run,
    concurrency: 1,
    maxQueued: 1,
    timeoutMs: 5000,
  });
  assert.ok(runner.enqueue({ text: 'a' })); // od razu running
  assert.ok(runner.enqueue({ text: 'b' })); // w kolejce
  assert.equal(runner.enqueue({ text: 'c' }), null);
});

test('wyjątek w run → done z błędem; timeout przekazany jako sygnał', async () => {
  const store = new SqliteJobStore(':memory:');
  let signal: AbortSignal | undefined;
  const runner = new JobRunner({
    store,
    concurrency: 1,
    maxQueued: 10,
    timeoutMs: 10,
    run: (_input, opts) => {
      signal = opts.abortSignal;
      return new Promise((_, reject) =>
        opts.abortSignal.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    },
  });
  const job = runner.enqueue({ text: 'a' });
  assert.ok(job);
  await new Promise((r) => setTimeout(r, 30));
  const done = store.get(job.checkId);
  assert.equal(signal?.aborted, true);
  assert.equal(done?.state, 'done');
  assert.ok(done?.result?.status === 'error' && done.result.code === 'timeout');
});

test('obraz nie trafia do bazy', () => {
  const store = new SqliteJobStore(':memory:');
  const job = store.create('id1', { image: { mediaType: 'image/png', data: 'AAAA' } }, new Date());
  assert.equal(job.state, 'queued');
  assert.ok(!JSON.stringify(store.get('id1')).includes('AAAA'));
});

test('dane osobowe są maskowane przed zapisem pytania', () => {
  const store = new SqliteJobStore(':memory:');
  store.create('p1', { text: 'Mój PESEL 44051401359, mail jan@example.com' }, new Date());
  const row = store.inputText('p1');
  assert.equal(row, 'Mój PESEL [PESEL], mail [EMAIL]');
});

test('przerwane zadania i retencja', () => {
  const store = new SqliteJobStore(':memory:');
  store.create('old', { text: 'x' }, new Date('2026-01-01T00:00:00Z'));
  store.create('new', { text: 'y' }, new Date('2026-11-21T00:00:00Z'));
  store.markRunning('new', new Date('2026-11-21T00:00:01Z'));
  assert.equal(store.failInterrupted(new Date('2026-11-21T00:01:00Z')), 2);
  assert.equal(store.get('new')?.state, 'done');
  assert.equal(store.get('new')?.result?.status, 'error');
  assert.equal(store.purgeOlderThan(new Date('2026-11-01T00:00:00Z')), 1);
  assert.equal(store.get('old'), undefined);
});

test('delete przerywa trwające zadanie i go nie zapisuje', async () => {
  const store = new SqliteJobStore(':memory:');
  const { run, seen, releaseAll } = deferredRun();
  const runner = new JobRunner({ store, run, concurrency: 1, maxQueued: 10, timeoutMs: 5000 });
  const job = runner.enqueue({ text: 'a' });
  assert.ok(job);
  assert.equal(runner.delete(job.checkId), true);
  assert.equal(seen[0]?.signal.aborted, true);
  releaseAll();
  await tick();
  assert.equal(store.get(job.checkId), undefined);
});
