import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseRpc, searchIncidents } from './euvsdisinfo.ts';

// Kształt odpowiedzi jak z serwera MCP; treść wymyślona na potrzeby testu.
const rpc = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    content: [{ type: 'text', text: 'Returning 3 most relevant results' }],
    structuredContent: {
      results: [
        {
          type: 'article',
          title: 'Analiza',
          content: '<p>x</p>',
          link: 'https://euvsdisinfo.eu/analiza/',
        },
        {
          type: 'claim_review',
          title: 'Poland plans to annex &quot;historical lands&quot; &#8211; Kyiv&#x2019;s view',
          content:
            '<h3>SUMMARY</h3><p>Poland is preparing to seize Western Ukraine.</p><h3>RESPONSE</h3><p>No evidence.</p>',
          link: 'https://euvsdisinfo.eu/report/poland-plans-to-annex',
        },
        {
          type: 'claim_review',
          title: 'Spoza bazy',
          content: '<h3>SUMMARY</h3><p>x y z</p>',
          link: 'https://example.com/report/x',
        },
      ],
    },
  },
};

const sse = (body: object) => `event: message\ndata: ${JSON.stringify(body)}\n\n`;

function fakeFetch(res: Response | Error) {
  const calls: RequestInit[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('zwraca tylko przypadki z euvsdisinfo.eu/report, ze streszczeniem bez części RESPONSE', async () => {
  const { fn, calls } = fakeFetch(new Response(sse(rpc), { status: 200 }));
  const result = await searchIncidents(
    { query: 'Polska zachodnia Ukraina' },
    { apiKey: 'k', fetch: fn },
  );
  assert.deepEqual(result, {
    ok: true,
    items: [
      {
        title: 'Poland plans to annex "historical lands" – Kyiv’s view',
        url: 'https://euvsdisinfo.eu/report/poland-plans-to-annex',
        summary: 'Poland is preparing to seize Western Ukraine.',
      },
    ],
  });
  const headers = calls[0]?.headers as Record<string, string>;
  assert.equal(headers['authorization'], 'Bearer k');
  assert.match(headers['accept'] ?? '', /text\/event-stream/);
  // Klucz nie trafia do treści ani adresu zapytania.
  assert.ok(typeof calls[0]?.body === 'string' && !calls[0].body.includes('"k"'));
});

test('brak klucza, odrzucony klucz, limit i awaria sieci to awaria źródła, a nie pusty wynik', async () => {
  assert.deepEqual(await searchIncidents({ query: 'abc' }, { apiKey: undefined }), {
    ok: false,
    reason: 'missing_key',
    message: 'Brak klucza EUvsDisinfo.',
  });
  const unauthorized = await searchIncidents(
    { query: 'abc' },
    { apiKey: 'k', fetch: fakeFetch(new Response('{}', { status: 401 })).fn },
  );
  assert.equal(unauthorized.ok, false);
  const rpcError = await searchIncidents(
    { query: 'abc' },
    {
      apiKey: 'k',
      fetch: fakeFetch(new Response(JSON.stringify({ error: { code: -32001, message: 'x' } }))).fn,
    },
  );
  assert.ok(!rpcError.ok && rpcError.reason === 'missing_key');
  const limited = await searchIncidents(
    { query: 'abc' },
    { apiKey: 'k', fetch: fakeFetch(new Response('', { status: 429 })).fn },
  );
  assert.ok(!limited.ok && limited.reason === 'rate_limited');
  const down = await searchIncidents(
    { query: 'abc' },
    { apiKey: 'k', fetch: fakeFetch(new TypeError('fetch failed')).fn },
  );
  assert.ok(!down.ok && down.reason === 'unavailable');
  const garbage = await searchIncidents(
    { query: 'abc' },
    { apiKey: 'k', fetch: fakeFetch(new Response('<html>', { status: 200 })).fn },
  );
  assert.ok(!garbage.ok && garbage.reason === 'unavailable');
});

test('parseRpc czyta zarówno JSON, jak i strumień SSE', () => {
  assert.deepEqual(parseRpc(JSON.stringify(rpc)), rpc);
  assert.deepEqual(parseRpc(sse(rpc)), rpc);
});
