import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import type { CheckJob, CheckRequest, CheckResponse } from '@prawdowid/contracts';

import { createApp, type AppDeps } from '../app.ts';
import type { GraphResult } from './graph.ts';
import { MESSAGES, WhatsAppChannel, verifySignature, type WhatsAppChannelDeps } from './webhook.ts';

const SECRET = 'app-secret';
const PHONE = '48500100200';

type Sent = { to: string; body: string };

function setup(
  over: Partial<WhatsAppChannelDeps> & {
    sendFails?: boolean;
    enqueueNull?: boolean;
    typingFails?: boolean;
  } = {},
) {
  const sent: Sent[] = [];
  const typing: string[] = [];
  const enqueued: CheckRequest[] = [];
  const deleted: string[] = [];
  const logs: Array<{ event: string; data: Record<string, unknown> }> = [];
  let n = 0;
  const channel = new WhatsAppChannel({
    appSecret: SECRET,
    verifyToken: 'verify-me',
    webOrigin: 'https://prawdowid.example/',
    llmConfigured: true,
    ratePerMinute: 100,
    typingRefreshMs: 0,
    log: (event, data = {}) => logs.push({ event, data }),
    graph: {
      sendText: async (to, body): Promise<GraphResult<void>> => {
        sent.push({ to, body });
        return over.sendFails ? { ok: false, error: 'http_500' } : { ok: true, value: undefined };
      },
      markReadTyping: async (id): Promise<GraphResult<void>> => {
        typing.push(id);
        return over.typingFails ? { ok: false, error: 'http_500' } : { ok: true, value: undefined };
      },
      downloadImage: async () => ({
        ok: true,
        value: { mediaType: 'image/png', data: 'aGVsbG8=' },
      }),
    },
    runner: {
      enqueue: (input) => {
        if (over.enqueueNull) return null;
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
    },
    ...over,
  });
  const deps: AppDeps = {
    quiet: true,
    llmConfigured: true,
    webOrigin: 'http://localhost:5173',
    clientKey: () => 'anon',
    rateLimit: { postPerMinute: 1, getPerMinute: 1 },
    health: () => ({ factchecks: false, corpusDocuments: 0 }),
    store: { get: () => undefined },
    runner: { stats: { queued: 0, running: 0 }, enqueue: () => null, delete: () => false },
    whatsapp: channel,
  };
  return { channel, app: createApp(deps), sent, typing, enqueued, deleted, logs };
}

function payload(message: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba',
        changes: [
          {
            field: 'messages',
            value: { messaging_product: 'whatsapp', messages: [{ from: PHONE, ...message }] },
          },
        ],
      },
    ],
  };
}

const sign = (raw: string) => `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;

async function deliver(ctx: ReturnType<typeof setup>, body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  const res = await ctx.app.request('/webhooks/whatsapp', {
    method: 'POST',
    body: raw,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature ?? sign(raw) },
  });
  await ctx.channel.idle();
  return res;
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

test('weryfikacja subskrypcji: dobry token → challenge, zły → 403', async () => {
  const { app } = setup();
  const ok = await app.request(
    '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42',
  );
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), '42');
  const bad = await app.request(
    '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42',
  );
  assert.equal(bad.status, 403);
});

test('zły lub brakujący podpis → 401, nic nie trafia do kolejki', async () => {
  const ctx = setup();
  const body = payload({ id: 'w1', type: 'text', text: { body: 'Czy wraca pobór?' } });
  assert.equal((await deliver(ctx, body, 'sha256=00')).status, 401);
  assert.equal((await deliver(ctx, body, '')).status, 401);
  assert.equal(ctx.enqueued.length, 0);
  assert.ok(ctx.logs.some((l) => l.event === 'whatsapp_bad_signature'));
});

test('verifySignature odrzuca podpis innym sekretem', () => {
  const raw = '{"a":1}';
  assert.equal(verifySignature(raw, sign(raw), SECRET), true);
  assert.equal(verifySignature(raw, sign(raw), 'other'), false);
});

test('tekst → enqueue({ text }) i „przeczytano, pisze…” zamiast wiadomości; powtórzony webhook → jedno zgłoszenie', async () => {
  const ctx = setup();
  const body = payload({
    id: 'w1',
    type: 'text',
    text: { body: '  Czy od grudnia wraca pobór? ' },
  });
  assert.equal((await deliver(ctx, body)).status, 200);
  await deliver(ctx, body);
  assert.deepEqual(ctx.enqueued, [{ text: 'Czy od grudnia wraca pobór?' }]);
  // Potwierdzenie to wskaźnik pisania, nie płatna wiadomość.
  assert.deepEqual(ctx.typing, ['w1']);
  assert.deepEqual(ctx.sent, []);
  // Numer telefonu nie trafia do logów.
  assert.ok(!JSON.stringify(ctx.logs).includes(PHONE));
});

test('wynik sprawdzenia wraca do nadawcy z werdyktem, źródłem i linkiem do WWW', async () => {
  const ctx = setup();
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Czy wraca pobór?' } }));
  ctx.channel.onCheckDone('c1', okResponse('c1'));
  ctx.channel.onCheckDone('obcy', okResponse('obcy')); // sprawdzenie z WWW: brak odpowiedzi
  await ctx.channel.idle();
  assert.equal(ctx.sent.length, 1);
  const reply = ctx.sent[0]!;
  assert.equal(reply.to, PHONE);
  assert.ok(reply.body.startsWith('❌ FAŁSZYWE'));
  assert.ok(reply.body.includes('https://www.gov.pl/web/obrona-narodowa/x'));
  assert.ok(reply.body.endsWith('https://prawdowid.example/w/c1'));
});

test('zdjęcie z podpisem → enqueue({ image, text })', async () => {
  const ctx = setup();
  await deliver(
    ctx,
    payload({ id: 'w1', type: 'image', image: { id: 'm1', caption: 'Czy to prawda?' } }),
  );
  assert.deepEqual(ctx.enqueued, [
    { image: { mediaType: 'image/png', data: 'aGVsbG8=' }, text: 'Czy to prawda?' },
  ]);
});

test('awaria pobrania zdjęcia → komunikat techniczny, bez zgłoszenia i bez werdyktu', async () => {
  const ctx = setup({
    graph: {
      sendText: async (to, body) => {
        ctx.sent.push({ to, body });
        return { ok: true, value: undefined };
      },
      markReadTyping: async () => ({ ok: true, value: undefined }),
      downloadImage: async () => ({ ok: false, error: 'http_404' }),
    },
  });
  await deliver(ctx, payload({ id: 'w1', type: 'image', image: { id: 'm1' } }));
  assert.equal(ctx.enqueued.length, 0);
  assert.deepEqual(
    ctx.sent.map((s) => s.body),
    [MESSAGES.imageFailed],
  );
  assert.ok(MESSAGES.imageFailed.includes('To nie jest werdykt'));
});

test('pełna kolejka → komunikat „zbyt wiele zgłoszeń”', async () => {
  const ctx = setup({ enqueueNull: true });
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Czy wraca pobór?' } }));
  assert.deepEqual(
    ctx.sent.map((s) => s.body),
    [MESSAGES.busy],
  );
});

test('brak modelu → komunikat o konfiguracji, nie werdykt', async () => {
  const ctx = setup({ llmConfigured: false });
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Czy wraca pobór?' } }));
  assert.equal(ctx.enqueued.length, 0);
  assert.deepEqual(
    ctx.sent.map((s) => s.body),
    [MESSAGES.notConfigured],
  );
});

test('pomoc, nieobsługiwany typ i za długi tekst', async () => {
  const ctx = setup();
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Pomoc' } }));
  await deliver(ctx, payload({ id: 'w2', type: 'audio', audio: { id: 'a1' } }));
  await deliver(ctx, payload({ id: 'w3', type: 'text', text: { body: 'x'.repeat(5000) } }));
  assert.equal(ctx.enqueued.length, 0);
  assert.deepEqual(
    ctx.sent.map((s) => s.body),
    [MESSAGES.help, MESSAGES.unsupported, MESSAGES.tooLong],
  );
});

test('USUŃ kasuje sprawdzenia tego numeru i nie odsyła już ich wyników', async () => {
  const ctx = setup();
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Pierwsze pytanie' } }));
  await deliver(ctx, payload({ id: 'w2', type: 'text', text: { body: 'Drugie pytanie' } }));
  await deliver(ctx, payload({ id: 'w3', type: 'text', text: { body: 'USUŃ' } }));
  assert.deepEqual(ctx.deleted, ['c1', 'c2']);
  assert.equal(ctx.sent.at(-1)?.body, MESSAGES.deleted(2));
  ctx.channel.onCheckDone('c1', okResponse('c1'));
  await ctx.channel.idle();
  assert.equal(ctx.sent.length, 1); // tylko potwierdzenie usunięcia
});

test('limit wiadomości na numer', async () => {
  const ctx = setup({ ratePerMinute: 1 });
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Pierwsze pytanie' } }));
  await deliver(ctx, payload({ id: 'w2', type: 'text', text: { body: 'Drugie pytanie' } }));
  assert.equal(ctx.enqueued.length, 1);
  assert.ok(ctx.sent.at(-1)?.body.startsWith('Za dużo wiadomości'));
});

test('awaria wysyłki Graph API → log whatsapp_send_failed, przetwarzanie się nie wywraca', async () => {
  const ctx = setup({ sendFails: true });
  const res = await deliver(
    ctx,
    payload({ id: 'w1', type: 'text', text: { body: 'Czy wraca pobór?' } }),
  );
  assert.equal(res.status, 200);
  ctx.channel.onCheckDone('c1', okResponse('c1'));
  await ctx.channel.idle();
  assert.equal(ctx.logs.filter((l) => l.event === 'whatsapp_send_failed').length, 1);
  assert.ok(!ctx.logs.some((l) => l.event === 'whatsapp_reply_sent'));
});

test('awaria „pisze…” → log whatsapp_typing_failed, wynik i tak wraca', async () => {
  const ctx = setup({ typingFails: true, typingRefreshMs: 1 });
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Czy wraca pobór?' } }));
  ctx.channel.onCheckDone('c1', okResponse('c1'));
  await ctx.channel.idle();
  assert.ok(ctx.logs.some((l) => l.event === 'whatsapp_typing_failed'));
  assert.equal(ctx.typing.length, 1); // po awarii nie ponawiamy
  assert.equal(ctx.sent.length, 1);
  assert.ok(ctx.sent[0]!.body.startsWith('❌ FAŁSZYWE'));
});

test('„pisze…” jest ponawiane w trakcie sprawdzenia i gaśnie po odpowiedzi', async () => {
  const ctx = setup({ typingRefreshMs: 5 });
  await deliver(ctx, payload({ id: 'w1', type: 'text', text: { body: 'Czy wraca pobór?' } }));
  await new Promise((r) => setTimeout(r, 40));
  const during = ctx.typing.length;
  assert.ok(during >= 2, `ponowienia: ${during}`);
  assert.ok(ctx.typing.every((id) => id === 'w1'));
  ctx.channel.onCheckDone('c1', okResponse('c1'));
  await ctx.channel.idle();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ctx.typing.length, during);
});

test('nieprawidłowy payload (np. same statusy doręczenia) jest ignorowany', async () => {
  const ctx = setup();
  const res = await deliver(ctx, {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { statuses: [{ id: 'w1', status: 'read' }] } }] }],
  });
  assert.equal(res.status, 200);
  assert.equal(ctx.sent.length, 0);
});
