import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

const okResponse = (checkId: string, verdict: 'potwierdzone' | 'fałszywe'): VerifyResult => ({
  response: {
    checkId,
    createdAt: new Date().toISOString(),
    durationMs: 5,
    status: 'ok',
    summary: verdict,
    claims: [],
    evidence: [],
    warnings: [],
  },
  metrics,
});

function reuseRunner(results: Array<(id: string) => VerifyResult>, ttlMs = 3600_000) {
  const store = new SqliteJobStore(':memory:');
  const pending: Array<() => void> = [];
  let calls = 0;
  const run: RunCheck = (_input, { checkId }) => {
    const make = results[calls++] ?? ((id: string) => okResponse(id, 'potwierdzone'));
    return new Promise((resolve) => pending.push(() => resolve(make(checkId))));
  };
  let clock = new Date('2026-11-21T10:00:00Z');
  const runner = new JobRunner({
    store,
    run,
    concurrency: 4,
    maxQueued: 10,
    timeoutMs: 5000,
    now: () => clock,
    reuse: {
      key: (input) => input.text ?? null,
      ttlMs,
      isReusable: (r) => r.response.status === 'ok',
    },
  });
  return {
    store,
    runner,
    calls: () => calls,
    release: () => pending.splice(0).forEach((r) => r()),
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
  };
}

const summary = (store: SqliteJobStore, id: string) => {
  const r = store.get(id)?.result;
  return r?.status === 'ok' ? r.summary : r?.status;
};

test('ponowne użycie: gotowy wynik i sprawdzenie w toku', async () => {
  const t = reuseRunner([(id) => okResponse(id, 'fałszywe')]);
  const a = t.runner.enqueue({ text: 'x' });
  const b = t.runner.enqueue({ text: 'x' }); // dołącza do trwającego
  assert.ok(a && b);
  assert.equal(t.calls(), 1);
  t.release();
  await tick();
  assert.equal(summary(t.store, b.checkId), 'fałszywe');
  const c = t.runner.enqueue({ text: 'x' }); // gotowy wynik
  assert.ok(c);
  assert.equal(c.state, 'done');
  assert.equal(summary(t.store, c.checkId), 'fałszywe');
  assert.equal(t.calls(), 1);
});

test('ponowne użycie: błąd nie jest utrwalany, czekające zgłoszenie sprawdzamy samodzielnie', async () => {
  const t = reuseRunner([
    (id) => ({
      response: {
        checkId: id,
        createdAt: 't',
        durationMs: 1,
        status: 'error',
        code: 'llm_unavailable',
        message: 'x',
      },
      metrics,
    }),
  ]);
  const a = t.runner.enqueue({ text: 'x' });
  const b = t.runner.enqueue({ text: 'x' });
  assert.ok(a && b);
  t.release();
  await tick();
  assert.equal(summary(t.store, a.checkId), 'error');
  assert.equal(t.calls(), 2, 'czekające zgłoszenie uruchomione osobno');
  t.release();
  await tick();
  assert.equal(summary(t.store, b.checkId), 'potwierdzone');
  const c = t.runner.enqueue({ text: 'x' });
  assert.equal(c && summary(t.store, c.checkId), 'potwierdzone');
});

test('ponowne użycie: wynik wygasa po czasie ważności', async () => {
  const t = reuseRunner([(id) => okResponse(id, 'fałszywe')], 60_000);
  t.runner.enqueue({ text: 'x' });
  t.release();
  await tick();
  t.advance(61_000);
  const b = t.runner.enqueue({ text: 'x' });
  assert.ok(b);
  assert.equal(t.calls(), 2);
  t.release();
  await tick();
  assert.equal(summary(t.store, b.checkId), 'potwierdzone');
});

test('ponowne użycie: usunięcie prowadzącego sprawdzenia uruchamia czekające', async () => {
  const t = reuseRunner([]);
  const a = t.runner.enqueue({ text: 'x' });
  const b = t.runner.enqueue({ text: 'x' });
  assert.ok(a && b);
  t.runner.delete(a.checkId);
  t.release();
  await tick();
  assert.equal(t.store.get(a.checkId), undefined);
  assert.equal(t.calls(), 2);
  t.release();
  await tick();
  assert.equal(summary(t.store, b.checkId), 'potwierdzone');
});

test('ponowne użycie: usunięta sesja nie jest już źródłem kopii', async () => {
  const t = reuseRunner([(id) => okResponse(id, 'fałszywe')]);
  const a = t.runner.enqueue({ text: 'x' });
  assert.ok(a);
  t.release();
  await tick();
  t.runner.delete(a.checkId);
  t.runner.enqueue({ text: 'x' });
  assert.equal(t.calls(), 2);
});

test('istniejąca baza bez kolumn ponownego użycia dostaje je przy starcie', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prawdowid-jobs-'));
  try {
    const path = join(dir, 'checks.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE checks (
      id TEXT PRIMARY KEY, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      input_text TEXT, has_image INTEGER NOT NULL DEFAULT 0, result_json TEXT, status TEXT,
      duration_ms INTEGER, metrics_json TEXT)`);
    old.exec(
      "INSERT INTO checks (id, state, created_at, updated_at) VALUES ('old', 'done', 't', 't')",
    );
    old.close();
    const store = new SqliteJobStore(path);
    store.create('new', { text: 'x' }, new Date(), 'key');
    assert.equal(store.get('old')?.state, 'done');
    assert.equal(store.findReusable('key', new Date(0)), undefined);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ponowne użycie: kopia przejmuje sygnały injection i rodzaje ukrytych danych, bez kosztu', async () => {
  const done: VerifyResult[] = [];
  const store = new SqliteJobStore(':memory:');
  const runner = new JobRunner({
    store,
    concurrency: 1,
    maxQueued: 10,
    timeoutMs: 5000,
    onDone: (_id, r) => done.push(r),
    run: async (_input, { checkId }) => ({
      ...okResponse(checkId, 'fałszywe'),
      metrics: {
        ...emptyMetrics(),
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        injectionSignals: [{ source: 'user', pattern: 'ignore_instructions' }],
        piiMasked: ['EMAIL'],
      },
    }),
    reuse: { key: () => 'k', ttlMs: 3600_000, isReusable: () => true },
  });
  runner.enqueue({ text: 'x' });
  await tick();
  runner.enqueue({ text: 'x' });
  await tick();
  const copy = done[1]?.metrics;
  assert.equal(copy?.reused, true);
  assert.equal(copy?.usage, null);
  assert.deepEqual(copy?.injectionSignals, [{ source: 'user', pattern: 'ignore_instructions' }]);
  assert.deepEqual(copy?.piiMasked, ['EMAIL']);
});
