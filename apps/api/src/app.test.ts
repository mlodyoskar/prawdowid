import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { CheckJob } from '@prawdowid/contracts';

import { createApp, type AppDeps } from './app.ts';

function setup(over: Partial<AppDeps> = {}) {
  const jobs = new Map<string, CheckJob>();
  const deps: AppDeps = {
    quiet: true,
    llmConfigured: true,
    webOrigin: 'http://localhost:5173',
    clientKey: (c) => c.req.header('x-test-client') ?? 'anon',
    rateLimit: { postPerMinute: 100, getPerMinute: 100 },
    health: () => ({ factchecks: false, corpusDocuments: 18 }),
    store: { get: (id) => jobs.get(id) },
    runner: {
      stats: { queued: 0, running: 0 },
      enqueue: () => {
        const job: CheckJob = { checkId: 'c1', state: 'queued', createdAt: 't', updatedAt: 't' };
        jobs.set(job.checkId, job);
        return job;
      },
      delete: (id) => jobs.delete(id),
    },
    ...over,
  };
  return { app: createApp(deps), jobs };
}

const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request('/api/checks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

test('POST → 202 z checkId i Location, GET zwraca stan', async () => {
  const { app, jobs } = setup();
  const res = await post(app, { text: 'Czy od grudnia wraca pobór?' });
  assert.equal(res.status, 202);
  assert.equal(res.headers.get('location'), '/api/checks/c1');
  assert.equal(((await res.json()) as CheckJob).state, 'queued');

  const pending = await app.request('/api/checks/c1');
  assert.equal(pending.status, 200);
  assert.equal(pending.headers.get('retry-after'), '1');

  jobs.set('c1', {
    checkId: 'c1',
    state: 'done',
    createdAt: 't',
    updatedAt: 't',
    result: {
      checkId: 'c1',
      createdAt: 't',
      durationMs: 1,
      status: 'error',
      code: 'llm_unavailable',
      message: 'x',
    },
  });
  const done = await app.request('/api/checks/c1');
  assert.equal(done.status, 200);
  assert.equal(((await done.json()) as CheckJob).result?.status, 'error');
});

test('walidacja: brak tekstu i zdjęcia → 400', async () => {
  const { app } = setup();
  assert.equal((await post(app, {})).status, 400);
  assert.equal((await post(app, { text: '   ' })).status, 400);
  assert.equal((await post(app, { image: { mediaType: 'image/gif', data: 'AAAA' } })).status, 400);
});

test('brak konfiguracji LLM i pełna kolejka → 503', async () => {
  assert.equal((await post(setup({ llmConfigured: false }).app, { text: 'x' })).status, 503);
  const busy = setup({
    runner: { stats: { queued: 50, running: 4 }, enqueue: () => null, delete: () => false },
  });
  const app = busy.app;
  const res = await post(app, { text: 'x' });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '10');
});

test('404 dla nieznanego id, DELETE → 204', async () => {
  const { app } = setup();
  assert.equal((await app.request('/api/checks/nope')).status, 404);
  await post(app, { text: 'x' });
  assert.equal((await app.request('/api/checks/c1', { method: 'DELETE' })).status, 204);
  assert.equal((await app.request('/api/checks/c1')).status, 404);
});

test('limit żądań: 429 z Retry-After po przekroczeniu, osobno dla każdego klienta', async () => {
  const events: Array<{ route: string; client: string }> = [];
  const { app } = setup({
    rateLimit: { postPerMinute: 2, getPerMinute: 100 },
    onRateLimited: (e) => events.push(e),
  });
  const send = (client: string) =>
    app.request('/api/checks', {
      method: 'POST',
      body: JSON.stringify({ text: 'x' }),
      headers: { 'content-type': 'application/json', 'x-test-client': client },
    });
  assert.equal((await send('1.1.1.1')).status, 202);
  assert.equal((await send('1.1.1.1')).status, 202);
  const limited = await send('1.1.1.1');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await send('2.2.2.2')).status, 202);
  assert.equal(events.length, 1);
  assert.notEqual(events[0]?.client, '1.1.1.1'); // w logu tylko skrót IP
});
