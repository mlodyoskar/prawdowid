import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GraphClient } from './graph.ts';

const href = (url: string | URL | Request) => (url instanceof Request ? url.url : url.toString());

const cfg = { accessToken: 'tok', phoneNumberId: '123', version: 'v23.0' };

test('sendText: POST na /{phone-number-id}/messages z tokenem', async () => {
  let call: { url: string; init: RequestInit } | undefined;
  const graph = new GraphClient({
    ...cfg,
    fetch: async (url, init) => {
      call = { url: href(url), init: init ?? {} };
      return Response.json({ messages: [{ id: 'wamid' }] });
    },
  });
  assert.deepEqual(await graph.sendText('48500100200', 'Cześć'), { ok: true, value: undefined });
  assert.equal(call?.url, 'https://graph.facebook.com/v23.0/123/messages');
  assert.equal(new Headers(call?.init.headers).get('authorization'), 'Bearer tok');
  const body = call?.init.body;
  assert.ok(typeof body === 'string');
  assert.deepEqual(JSON.parse(body), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '48500100200',
    type: 'text',
    text: { preview_url: false, body: 'Cześć' },
  });
});

test('awaria Graph API (HTTP i sieć) wraca jako wynik, bez wyjątku', async () => {
  const http = new GraphClient({
    ...cfg,
    fetch: async () => Response.json({ error: { code: 190, message: 'expired' } }, { status: 401 }),
  });
  assert.deepEqual(await http.sendText('1', 'x'), { ok: false, error: 'http_401_graph_190' });
  const net = new GraphClient({
    ...cfg,
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.deepEqual(await net.downloadImage('m1'), { ok: false, error: 'network' });
});

test('downloadImage: metadane → bajty → base64; odrzuca nieobsługiwany typ', async () => {
  const urls: string[] = [];
  const make = (mime: string) =>
    new GraphClient({
      ...cfg,
      fetch: async (url) => {
        urls.push(href(url));
        return href(url).includes('lookaside')
          ? new Response(new Uint8Array([104, 105]))
          : Response.json({ url: 'https://lookaside.fbsbx.com/m1', mime_type: mime });
      },
    });
  assert.deepEqual(await make('image/jpeg').downloadImage('m1'), {
    ok: true,
    value: { mediaType: 'image/jpeg', data: 'aGk=' },
  });
  assert.deepEqual(urls, ['https://graph.facebook.com/v23.0/m1', 'https://lookaside.fbsbx.com/m1']);
  assert.deepEqual(await make('image/gif').downloadImage('m1'), {
    ok: false,
    error: 'unsupported_media_type',
  });
});
