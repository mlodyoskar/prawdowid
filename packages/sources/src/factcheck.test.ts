import assert from 'node:assert/strict';
import { test } from 'node:test';

import { searchFactChecks } from './factcheck.ts';

const okBody = {
  claims: [
    {
      text: 'Od grudnia wraca pobór',
      claimant: 'Facebook',
      claimReview: [
        {
          publisher: { name: 'Demagog', site: 'demagog.org.pl' },
          url: 'https://demagog.org.pl/x',
          title: 'Pobór nie wraca',
          reviewDate: '2026-11-08T00:00:00Z',
          textualRating: 'Fałsz',
        },
      ],
    },
  ],
};

const fakeFetch = (res: Response | Error): typeof fetch => {
  return (async (input: URL) => {
    fakeFetch.lastUrl = input.href;
    if (res instanceof Error) throw res;
    return res;
  }) as typeof fetch;
};
fakeFetch.lastUrl = '';

test('mapuje claimReview na trafienia', async () => {
  const res = await searchFactChecks(
    { query: 'pobór' },
    { apiKey: 'k', fetch: fakeFetch(Response.json(okBody)) },
  );
  assert.ok(res.ok);
  assert.deepEqual(res.items[0], {
    kind: 'factcheck',
    title: 'Pobór nie wraca',
    publisher: 'Demagog',
    url: 'https://demagog.org.pl/x',
    publishedAt: '2026-11-08T00:00:00Z',
    fetchedAt: null,
    excerpt: 'Od grudnia wraca pobór (autor twierdzenia: Facebook)',
    rating: 'Fałsz',
    sourceType: 'secondary',
  });
  assert.match(fakeFetch.lastUrl, /languageCode=pl/);
});

test('brak klucza → missing_key bez zapytania', async () => {
  const res = await searchFactChecks(
    { query: 'x' },
    { apiKey: undefined, fetch: fakeFetch(new Error('nie powinno')) },
  );
  assert.deepEqual(res.ok ? null : res.reason, 'missing_key');
});

test('429 → rate_limited, 500 → unavailable, błąd sieci → unavailable', async () => {
  for (const [input, reason] of [
    [new Response('', { status: 429 }), 'rate_limited'],
    [new Response('', { status: 500 }), 'unavailable'],
    [new TypeError('fetch failed'), 'unavailable'],
    [new DOMException('t', 'TimeoutError'), 'unavailable'],
  ] as const) {
    const res = await searchFactChecks({ query: 'x' }, { apiKey: 'k', fetch: fakeFetch(input) });
    assert.equal(res.ok ? null : res.reason, reason);
  }
});
