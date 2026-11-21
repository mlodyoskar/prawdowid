import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractUrls, fetchPage, isPrivateAddress, parseHtml } from './fetch-url.ts';

const publicLookup = async () => ['93.184.216.34'];
const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });

function fakeFetch(responses: Response[]) {
  const urls: string[] = [];
  const fetch = (async (input: URL) => {
    urls.push(input.href);
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r;
  }) as typeof globalThis.fetch;
  return { fetch, urls };
}

test('extractUrls: max 2, bez interpunkcji na końcu', () => {
  assert.deepEqual(extractUrls('Zobacz https://a.pl/x, oraz http://b.pl/y. i https://c.pl'), [
    'https://a.pl/x',
    'http://b.pl/y',
  ]);
  assert.deepEqual(extractUrls('bez linków'), []);
});

test('isPrivateAddress', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '192.168.0.10',
    '172.20.0.1',
    '169.254.169.254',
    '::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '0.0.0.0',
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111'])
    assert.equal(isPrivateAddress(ip), false, ip);
});

test('pobiera stronę i wyciąga tytuł, wydawcę, datę i treść bez skryptów', async () => {
  const { fetch } = fakeFetch([
    html(`<html><head><title>Tytuł &amp; coś</title>
      <meta property="og:site_name" content="Portal X">
      <meta property="article:published_time" content="2026-11-20T10:00:00Z">
      <script>alert('x')</script></head>
      <body><nav>menu</nav><article><h1>Nagłówek</h1><p>Treść artykułu.</p></article></body></html>`),
  ]);
  const res = await fetchPage('https://example.com/a', {
    fetch,
    lookup: publicLookup,
    now: () => new Date('2026-11-21T00:00:00Z'),
  });
  assert.ok(res.ok);
  assert.equal(res.title, 'Tytuł & coś');
  assert.equal(res.publisher, 'Portal X');
  assert.equal(res.publishedAt, '2026-11-20T10:00:00Z');
  assert.equal(res.fetchedAt, '2026-11-21T00:00:00.000Z');
  assert.match(res.text, /Treść artykułu/);
  assert.doesNotMatch(res.text, /alert|menu/);
});

test('SSRF: odrzuca localhost, adresy prywatne, niestandardowe porty i inne schematy', async () => {
  const { fetch, urls } = fakeFetch([]);
  const cases: Array<[string, string]> = [
    ['http://127.0.0.1/', 'forbidden_address'],
    ['http://[::1]/', 'forbidden_address'],
    ['http://example.com:8080/', 'forbidden_address'],
    ['file:///etc/passwd', 'invalid_url'],
    ['http://user:pass@example.com/', 'invalid_url'],
  ];
  for (const [url, reason] of cases) {
    const res = await fetchPage(url, { fetch, lookup: publicLookup });
    assert.equal(res.ok ? null : res.reason, reason, url);
  }
  const internal = await fetchPage('http://intranet.example/', {
    fetch,
    lookup: async () => ['10.0.0.5'],
  });
  assert.equal(internal.ok ? null : internal.reason, 'forbidden_address');
  assert.equal(urls.length, 0);
});

test('SSRF po przekierowaniu i limit przekierowań', async () => {
  const lookup = async (host: string) =>
    host === 'evil.internal' ? ['192.168.1.1'] : ['93.184.216.34'];
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  const a = fakeFetch([redirect('http://evil.internal/admin')]);
  const res = await fetchPage('https://example.com/', { fetch: a.fetch, lookup });
  assert.equal(res.ok ? null : res.reason, 'forbidden_address');
  assert.equal(a.urls.length, 1);

  const b = fakeFetch([redirect('/1'), redirect('/2'), redirect('/3'), redirect('/4')]);
  const res2 = await fetchPage('https://example.com/', { fetch: b.fetch, lookup });
  assert.equal(res2.ok ? null : res2.reason, 'unavailable');
});

test('403, wyzwanie JS, nie-HTML i za duża strona → bez treści', async () => {
  const opts = { lookup: publicLookup };
  const cases: Array<[Response, string]> = [
    [new Response('', { status: 403 }), 'blocked'],
    [html('<html><body><script src="/_Incapsula_Resource"></script></body></html>'), 'blocked'],
    [new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }), 'unsupported'],
    [html('x'.repeat(200), { 'content-length': '999999999' }), 'too_large'],
  ];
  for (const [response, reason] of cases) {
    const res = await fetchPage('https://example.com/', {
      ...opts,
      fetch: fakeFetch([response]).fetch,
    });
    assert.equal(res.ok ? null : res.reason, reason);
  }
  const big = await fetchPage('https://example.com/', {
    ...opts,
    maxBytes: 100,
    fetch: fakeFetch([html('y'.repeat(500))]).fetch,
  });
  assert.equal(big.ok ? null : big.reason, 'too_large');
});

test('parseHtml przycina treść', () => {
  assert.equal(parseHtml(`<body>${'a'.repeat(50)}</body>`, 10).text, `${'a'.repeat(10)}…`);
});
