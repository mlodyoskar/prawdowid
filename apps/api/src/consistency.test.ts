import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { emptyMetrics, type VerifyResult } from '@prawdowid/agent';
import type { CheckJob, CheckRequest, CheckResponse } from '@prawdowid/contracts';

import { createApp } from './app.ts';
import { JobRunner, SqliteJobStore, type RunCheck } from './jobs.ts';
import { isReusable, reuseKey } from './reuse.ts';
import { WhatsAppChannel, metaWebhookRoutes } from './whatsapp/webhook.ts';

const SECRET = 'secret';
const URLS = ['https://www.gov.pl/a', 'https://www.gov.pl/b', 'https://www.gov.pl/c'];

/**
 * Agent, który za każdym razem daje inny wynik: inny werdykt i inne źródło.
 * Tak zachowuje się prawdziwy model, gdy plan zapytań wypada inaczej.
 */
function randomAgent() {
  let calls = 0;
  const run: RunCheck = async (_input: CheckRequest, { checkId }) => {
    const n = calls++;
    const url = URLS[n % URLS.length] ?? '';
    const response: CheckResponse = {
      checkId,
      createdAt: new Date().toISOString(),
      durationMs: 10,
      status: 'ok',
      summary: 'x',
      claims: [
        {
          claim: 'Teza',
          verdict: n % 2 === 0 ? 'potwierdzone' : 'fałszywe',
          confidence: 'średnia',
          explanation: 'Wyjaśnienie.',
          evidenceIds: ['doc_1', 'doc_2'],
          limitations: '',
          evidenceUse: [
            { id: 'doc_2', stance: 'context', quote: 'kontekst' },
            { id: 'doc_1', stance: n % 2 === 0 ? 'supports' : 'refutes', quote: 'cytat' },
          ],
        },
      ],
      evidence: [
        {
          id: 'doc_1',
          kind: 'corpus',
          title: `Komunikat ${n}`,
          publisher: 'GIS',
          publishedAt: '2026-11-01',
          url,
          fetchedAt: null,
          excerpt: 'cytat',
        },
        {
          id: 'doc_2',
          kind: 'corpus',
          title: 'Inna sprawa',
          publisher: 'RCB',
          publishedAt: '2026-11-02',
          url: 'https://www.gov.pl/kontekst',
          fetchedAt: null,
          excerpt: 'kontekst',
        },
      ],
      warnings: [],
    };
    return { response, metrics: emptyMetrics() } satisfies VerifyResult;
  };
  return { run, calls: () => calls };
}

function setup(reuse = true) {
  const store = new SqliteJobStore(':memory:');
  const agent = randomAgent();
  const replies: string[] = [];
  let channel: WhatsAppChannel | undefined;
  const runner = new JobRunner({
    store,
    run: agent.run,
    concurrency: 4,
    maxQueued: 10,
    timeoutMs: 5000,
    onDone: (id, result) => channel?.onCheckDone(id, result.response),
    ...(reuse ? { reuse: { key: (i) => reuseKey(i, 'test'), ttlMs: 3600_000, isReusable } } : {}),
  });
  channel = new WhatsAppChannel({
    webOrigin: 'https://prawdowid.example',
    llmConfigured: true,
    ratePerMinute: 100,
    log: () => {},
    runner,
    transport: {
      sendText: async (_to, body) => {
        replies.push(body);
        return { ok: true, value: undefined };
      },
      markReadTyping: async () => ({ ok: true, value: undefined }),
      downloadImage: async () => ({ ok: false, error: 'unused' }),
    },
  });
  const app = createApp({
    quiet: true,
    llmConfigured: true,
    webOrigin: 'https://prawdowid.example',
    clientKey: () => 'anon',
    rateLimit: { postPerMinute: 100, getPerMinute: 100 },
    health: () => ({ factchecks: false, corpusDocuments: 1 }),
    store,
    runner,
    whatsapp: metaWebhookRoutes(channel, { appSecret: SECRET, verifyToken: 'v', log: () => {} }),
  });
  return { app, channel, replies, agent };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

async function viaWeb(app: ReturnType<typeof createApp>, text: string): Promise<CheckResponse> {
  const res = await app.request('/api/checks', {
    method: 'POST',
    body: JSON.stringify({ text }),
    headers: { 'content-type': 'application/json' },
  });
  const { checkId } = (await res.json()) as CheckJob;
  await settle();
  const job = (await (await app.request(`/api/checks/${checkId}`)).json()) as CheckJob;
  assert.ok(job.result, 'web check finished');
  return job.result;
}

async function viaWhatsApp(
  app: ReturnType<typeof createApp>,
  channel: WhatsAppChannel,
  replies: string[],
  text: string,
  id: string,
): Promise<string> {
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: { messages: [{ from: '48500100200', id, type: 'text', text: { body: text } }] },
          },
        ],
      },
    ],
  });
  const res = await app.request('/webhooks/whatsapp', {
    method: 'POST',
    body,
    headers: {
      'x-hub-signature-256': `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
    },
  });
  assert.equal(res.status, 200);
  await settle();
  await channel.idle();
  const reply = replies.at(-1);
  assert.ok(reply, 'whatsapp reply sent');
  return reply;
}

const basisUrls = (r: CheckResponse) =>
  r.status === 'ok'
    ? r.claims.flatMap((c) =>
        (c.evidenceUse ?? [])
          .filter((u) => u.stance !== 'context')
          .map((u) => r.evidence.find((e) => e.id === u.id)?.url),
      )
    : [];

test('scenariusz G: to samo zgłoszenie w WWW i WhatsApp daje ten sam werdykt i tę samą publikację', async () => {
  const { app, channel, replies, agent } = setup();
  const web = await viaWeb(app, 'GIS ostrzegł przed kubkiem z melaminy.');
  // Inne białe znaki i wielkość liter: komunikator i formularz nie zawsze przekazują tekst identycznie.
  const reply = await viaWhatsApp(
    app,
    channel,
    replies,
    '  gis ostrzegł przed kubkiem  z melaminy. ',
    'm1',
  );
  const again = await viaWeb(app, 'GIS ostrzegł przed kubkiem z melaminy.');

  assert.equal(agent.calls(), 1, 'jedno sprawdzenie dla trzech zgłoszeń');
  assert.ok(web.status === 'ok' && again.status === 'ok');
  const verdict = web.claims[0]?.verdict ?? '';
  assert.ok(reply.includes(verdict.toUpperCase()), 'ten sam werdykt w WhatsApp');
  for (const url of basisUrls(web)) assert.ok(url && reply.includes(url), 'ta sama publikacja');
  assert.ok(!reply.includes('https://www.gov.pl/kontekst'), 'kontekst zostaje w pełnym wyniku');
  assert.deepEqual(again.claims, web.claims);
  assert.deepEqual(again.evidence, web.evidence);
  assert.notEqual(again.checkId, web.checkId);
  assert.equal(again.reusedFrom?.createdAt, web.createdAt);
});

test('bez ponownego użycia ten sam losowy agent daje różne odpowiedzi (kontrola testu)', async () => {
  const { app, channel, replies } = setup(false);
  const web = await viaWeb(app, 'GIS ostrzegł przed kubkiem z melaminy.');
  const reply = await viaWhatsApp(
    app,
    channel,
    replies,
    'GIS ostrzegł przed kubkiem z melaminy.',
    'm2',
  );
  assert.ok(web.status === 'ok');
  assert.ok(!reply.includes(web.claims[0]?.verdict.toUpperCase() ?? ''));
});

test('zgłoszenia wysłane naraz z obu kanałów dołączają do jednego sprawdzenia', async () => {
  const { app, channel, replies, agent } = setup();
  const [web, reply] = await Promise.all([
    viaWeb(app, 'Ta sama treść.'),
    viaWhatsApp(app, channel, replies, 'Ta sama treść.', 'm3'),
  ]);
  assert.equal(agent.calls(), 1);
  assert.ok(web.status === 'ok');
  assert.ok(reply.includes(web.claims[0]?.verdict.toUpperCase() ?? '-'));
});
