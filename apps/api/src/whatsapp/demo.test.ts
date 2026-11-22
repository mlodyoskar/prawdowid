import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  resultUrl,
  type CheckJob,
  type CheckRequest,
  type CheckResponse,
} from '@prawdowid/contracts';

import { createApp } from '../app.ts';
import { DemoTransport, demoRoutes, type DemoOutboundMessage } from './demo.ts';
import {
  MESSAGES,
  WhatsAppChannel,
  metaWebhookRoutes,
  type WhatsAppChannelDeps,
} from './webhook.ts';

const SECRET = 'app-secret';
const SESSION = 'b3f1c0de-0000-4000-8000-123456789abc';
const PNG = 'iVBORw0KGgo=';

type Logs = Array<{ event: string; data: Record<string, unknown> }>;

function fakeRunner(opts: { enqueueNull?: boolean } = {}) {
  const enqueued: CheckRequest[] = [];
  const deleted: string[] = [];
  let n = 0;
  const runner: WhatsAppChannelDeps['runner'] = {
    enqueue: (input) => {
      if (opts.enqueueNull) return null;
      enqueued.push(input);
      n++;
      return {
        checkId: `c${n}`,
        state: 'queued',
        createdAt: 't',
        updatedAt: 't',
      } satisfies CheckJob;
    },
    delete: (id) => {
      deleted.push(id);
      return true;
    },
  };
  return { runner, enqueued, deleted };
}

function setup(
  over: {
    llmConfigured?: boolean;
    enqueueNull?: boolean;
    ratePerMinute?: number;
    postPerMinute?: number;
    getPerMinute?: number;
  } = {},
) {
  const logs: Logs = [];
  const log: WhatsAppChannelDeps['log'] = (event, data = {}) => logs.push({ event, data });
  const base = {
    webOrigin: 'https://prawdowid.example',
    llmConfigured: over.llmConfigured ?? true,
    ratePerMinute: over.ratePerMinute ?? 100,
    typingRefreshMs: 0,
    log,
  };

  // Prawdziwy kanał: webhook Meta z podpisem, odpowiedzi do (udawanego) Graph API.
  const real = fakeRunner(over);
  const sent: Array<{ to: string; body: string }> = [];
  const realChannel = new WhatsAppChannel({
    ...base,
    runner: real.runner,
    transport: {
      sendText: async (to, body) => {
        sent.push({ to, body });
        return { ok: true, value: undefined };
      },
      markReadTyping: async () => ({ ok: true, value: undefined }),
      downloadImage: async () => ({ ok: true, value: { mediaType: 'image/png', data: PNG } }),
    },
  });

  // Symulator: ta sama klasa, transport w pamięci.
  const demo = fakeRunner(over);
  const transport = new DemoTransport();
  const demoChannel = new WhatsAppChannel({ ...base, runner: demo.runner, transport });

  const app = createApp({
    quiet: true,
    llmConfigured: true,
    webOrigin: 'http://localhost:5173',
    clientKey: () => 'ip-1',
    rateLimit: { postPerMinute: over.postPerMinute ?? 100, getPerMinute: over.getPerMinute ?? 100 },
    health: () => ({ factchecks: false, corpusDocuments: 0 }),
    store: { get: () => undefined },
    runner: { stats: { queued: 0, running: 0 }, enqueue: () => null, delete: () => false },
    whatsapp: metaWebhookRoutes(realChannel, { appSecret: SECRET, verifyToken: 'v', log }),
    whatsappDemo: demoRoutes(demoChannel, transport, { log }),
  });
  return { app, realChannel, demoChannel, transport, sent, real, demo, logs };
}

type Ctx = ReturnType<typeof setup>;

async function postDemo(ctx: Ctx, body: unknown) {
  const res = await ctx.app.request('/api/demo/whatsapp/messages', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  await ctx.demoChannel.idle();
  return res;
}

async function readDemo(ctx: Ctx, after = 0, sessionId = SESSION) {
  const res = await ctx.app.request(
    `/api/demo/whatsapp/messages?sessionId=${sessionId}&after=${after}`,
  );
  assert.equal(res.status, 200);
  return (await res.json()) as { messages: DemoOutboundMessage[]; typing: boolean };
}

async function deliverMeta(ctx: Ctx, message: Record<string, unknown>) {
  const raw = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ from: '48500100200', ...message }] } }] }],
  });
  const res = await ctx.app.request('/webhooks/whatsapp', {
    method: 'POST',
    body: raw,
    headers: {
      'x-hub-signature-256': `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`,
    },
  });
  assert.equal(res.status, 200);
  await ctx.realChannel.idle();
}

const okResponse = (checkId: string): CheckResponse => ({
  checkId,
  createdAt: 't',
  durationMs: 1,
  status: 'ok',
  summary: 's',
  claims: [
    {
      claim: 'Od grudnia wraca pobór',
      verdict: 'fałszywe',
      confidence: 'wysoka',
      explanation: 'MON zaprzecza.',
      evidenceIds: ['e1'],
      limitations: '',
    },
  ],
  evidence: [
    {
      id: 'e1',
      kind: 'corpus',
      title: 'Komunikat MON',
      publisher: 'MON',
      url: 'https://www.gov.pl/web/obrona-narodowa/x',
      publishedAt: '2026-11-01',
      fetchedAt: null,
      excerpt: 'x',
    },
  ],
  warnings: [],
});

const texts = async (ctx: Ctx) => (await readDemo(ctx)).messages.map((m) => m.text);

test('symulator i webhook Meta: to samo zgłoszenie i ten sam wynik → identyczna odpowiedź', async () => {
  const ctx = setup();
  await deliverMeta(ctx, { id: 'w1', type: 'text', text: { body: ' Czy wraca pobór? ' } });
  assert.equal(
    (await postDemo(ctx, { sessionId: SESSION, text: ' Czy wraca pobór? ' })).status,
    202,
  );
  assert.deepEqual(ctx.demo.enqueued, ctx.real.enqueued);
  assert.deepEqual(ctx.demo.enqueued, [{ text: 'Czy wraca pobór?' }]);

  // Do czasu wyniku: „pisze…”, bez wiadomości (jak w WhatsApp).
  const during = await readDemo(ctx);
  assert.deepEqual(during, { messages: [], typing: true });

  ctx.realChannel.onCheckDone('c1', okResponse('c1'));
  ctx.demoChannel.onCheckDone('c1', okResponse('c1'));
  await ctx.realChannel.idle();
  await ctx.demoChannel.idle();

  const after = await readDemo(ctx);
  assert.equal(after.typing, false);
  assert.equal(after.messages.length, 1);
  assert.equal(after.messages[0]!.text, ctx.sent[0]!.body);
  assert.ok(after.messages[0]!.text.startsWith('❌ FAŁSZYWE'));
  assert.ok(after.messages[0]!.text.endsWith('https://prawdowid.example/w/c1'));
});

test('polecenia POMOC i USUŃ działają jak w WhatsApp', async () => {
  const ctx = setup();
  await postDemo(ctx, { sessionId: SESSION, text: 'pomoc' });
  await postDemo(ctx, { sessionId: SESSION, text: 'Czy wraca pobór?' });
  await postDemo(ctx, { sessionId: SESSION, text: 'USUŃ' });
  assert.deepEqual(ctx.demo.deleted, ['c1']);
  assert.deepEqual(await texts(ctx), [MESSAGES.help, MESSAGES.deleted(1)]);
  // Wynik usuniętego sprawdzenia już nie przychodzi.
  ctx.demoChannel.onCheckDone('c1', okResponse('c1'));
  await ctx.demoChannel.idle();
  assert.equal((await readDemo(ctx)).messages.length, 2);
});

test('parametr after zwraca tylko nowe odpowiedzi', async () => {
  const ctx = setup();
  await postDemo(ctx, { sessionId: SESSION, text: 'pomoc' });
  await postDemo(ctx, { sessionId: SESSION, text: 'start' });
  const all = await readDemo(ctx);
  assert.deepEqual(
    all.messages.map((m) => m.id),
    [1, 2],
  );
  assert.deepEqual(
    (await readDemo(ctx, 1)).messages.map((m) => m.id),
    [2],
  );
  // Inna sesja nie widzi cudzych odpowiedzi.
  assert.deepEqual(await readDemo(ctx, 0, 'inna-sesja-1234567890'), {
    messages: [],
    typing: false,
  });
});

test('awarie wracają jako komunikat „To nie jest werdykt”, nie werdykt', async () => {
  const noLlm = setup({ llmConfigured: false });
  await postDemo(noLlm, { sessionId: SESSION, text: 'Czy wraca pobór?' });
  assert.deepEqual(await texts(noLlm), [MESSAGES.notConfigured]);
  assert.equal(noLlm.demo.enqueued.length, 0);

  const busy = setup({ enqueueNull: true });
  await postDemo(busy, { sessionId: SESSION, text: 'Czy wraca pobór?' });
  assert.deepEqual(await texts(busy), [MESSAGES.busy]);

  const badImage = setup();
  await postDemo(badImage, { sessionId: SESSION, image: { mediaType: 'image/gif', data: PNG } });
  await postDemo(badImage, {
    sessionId: SESSION,
    image: { mediaType: 'image/png', data: 'to nie jest base64!' },
  });
  assert.deepEqual(await texts(badImage), [MESSAGES.imageFailed, MESSAGES.imageFailed]);
  assert.equal(badImage.demo.enqueued.length, 0);
  for (const m of [MESSAGES.notConfigured, MESSAGES.busy, MESSAGES.imageFailed]) {
    assert.ok(m.includes('To nie jest werdykt'));
  }

  const tooLong = setup();
  await postDemo(tooLong, { sessionId: SESSION, text: 'x'.repeat(5000) });
  assert.deepEqual(await texts(tooLong), [MESSAGES.tooLong]);
});

test('zdjęcie z podpisem → enqueue({ image, text }), obraz nie zostaje w pamięci', async () => {
  const ctx = setup();
  await postDemo(ctx, {
    sessionId: SESSION,
    text: 'Czy to prawda?',
    image: { mediaType: 'image/png', data: PNG },
  });
  assert.deepEqual(ctx.demo.enqueued, [
    { image: { mediaType: 'image/png', data: PNG }, text: 'Czy to prawda?' },
  ]);
  assert.deepEqual(await ctx.transport.downloadImage('demo-media-x'), {
    ok: false,
    error: 'media_not_found',
  });
});

test('limit wiadomości na sesję (w kanale) i na IP (w API)', async () => {
  const perSession = setup({ ratePerMinute: 1 });
  await postDemo(perSession, { sessionId: SESSION, text: 'Pierwsze pytanie' });
  await postDemo(perSession, { sessionId: SESSION, text: 'Drugie pytanie' });
  assert.equal(perSession.demo.enqueued.length, 1);
  assert.ok((await texts(perSession)).at(-1)?.startsWith('Za dużo wiadomości'));

  const perIp = setup({ postPerMinute: 2 });
  assert.equal((await postDemo(perIp, { sessionId: SESSION, text: 'a' })).status, 202);
  assert.equal(
    (await postDemo(perIp, { sessionId: 'druga-sesja-12345678', text: 'b' })).status,
    202,
  );
  const limited = await postDemo(perIp, { sessionId: 'trzecia-sesja-1234567', text: 'c' });
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});

test('walidacja: zły identyfikator sesji, brak treści, zły JSON', async () => {
  const ctx = setup();
  // Numer telefonu nie jest identyfikatorem sesji.
  assert.equal((await postDemo(ctx, { sessionId: '48500100200', text: 'a' })).status, 400);
  assert.equal((await postDemo(ctx, { sessionId: SESSION })).status, 400);
  assert.equal((await postDemo(ctx, '{nie json')).status, 400);
  assert.equal(
    (await postDemo(ctx, { sessionId: SESSION, image: { mediaType: 'image/png' } })).status,
    400,
  );
  assert.equal((await ctx.app.request('/api/demo/whatsapp/messages')).status, 400);
  assert.equal(
    (await ctx.app.request(`/api/demo/whatsapp/messages?sessionId=${SESSION}&after=-1`)).status,
    400,
  );
  assert.equal(ctx.demo.enqueued.length, 0);
});

test('identyfikator sesji nie trafia do logów; DELETE czyści skrzynkę', async () => {
  const ctx = setup();
  await postDemo(ctx, { sessionId: SESSION, text: 'Czy wraca pobór?' });
  await postDemo(ctx, { sessionId: SESSION, text: 'pomoc' });
  assert.ok(ctx.logs.some((l) => l.event === 'whatsapp_message_received'));
  assert.ok(!JSON.stringify(ctx.logs).includes(SESSION));
  const del = await ctx.app.request(`/api/demo/whatsapp/messages?sessionId=${SESSION}`, {
    method: 'DELETE',
  });
  assert.equal(del.status, 204);
  assert.deepEqual(await readDemo(ctx), { messages: [], typing: false });
});

test('/health pokazuje symulator wśród kanałów', async () => {
  const ctx = setup();
  const health = (await (await ctx.app.request('/health')).json()) as {
    channels: Record<string, boolean>;
  };
  assert.deepEqual(health.channels, { web: true, whatsapp: true, whatsappDemo: true });
});

test('DemoTransport ma ograniczoną pamięć: liczba rozmów, wiadomości i czas życia', async () => {
  let now = 0;
  const t = new DemoTransport({
    maxSessions: 2,
    maxMessages: 3,
    sessionTtlMs: 1000,
    typingMs: 100,
    now: () => now,
  });
  for (let i = 1; i <= 5; i++) await t.sendText('a'.repeat(16), `m${i}`);
  assert.deepEqual(
    t.read('a'.repeat(16), 0).messages.map((m) => m.text),
    ['m3', 'm4', 'm5'],
  );
  await t.sendText('b'.repeat(16), 'x');
  await t.sendText('c'.repeat(16), 'x');
  assert.equal(t.size, 2);
  assert.deepEqual(t.read('a'.repeat(16), 0).messages, []); // najdawniej używana wypadła

  await t.markReadTyping('w1', 'c'.repeat(16));
  assert.equal(t.read('c'.repeat(16), 0).typing, true);
  now = 150;
  assert.equal(t.read('c'.repeat(16), 0).typing, false); // wskaźnik gaśnie jak w Meta
  now = 5000;
  assert.equal(t.read('b'.repeat(16), 0).messages.length, 0);
  assert.equal(t.size, 0);

  await t.sendText('d'.repeat(16), 'y'.repeat(5000));
  assert.equal(t.read('d'.repeat(16), 0).messages[0]!.text.length, 4096);
});
