import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { ensureSchema, insertDocument, openCorpus } from './corpus.ts';

function seeded() {
  const path = join(mkdtempSync(join(tmpdir(), 'corpus-')), 'c.db');
  const db = new DatabaseSync(path);
  ensureSchema(db);
  insertDocument(db, {
    url: 'mock://mon.gov.pl/pobor',
    title: 'MON dementuje informacje o przywróceniu poboru',
    publisher: 'MON',
    sourceType: 'primary',
    publishedAt: '2026-11-07',
    fetchedAt: '2026-11-21T00:00:00Z',
    content: 'Ministerstwo nie prowadzi prac nad przywróceniem obowiązkowej służby wojskowej.',
    isMock: true,
  });
  insertDocument(db, {
    url: 'mock://imgw.pl/wiatr',
    title: 'Ostrzeżenie przed silnym wiatrem',
    publisher: 'IMGW',
    sourceType: 'primary',
    publishedAt: '2026-11-20',
    fetchedAt: '2026-11-21T00:00:00Z',
    content: 'Porywy wiatru do 100 km/h na Pomorzu.',
  });
  db.close();
  return openCorpus(path);
}

test('znajduje dokument mimo odmiany i braku polskich znaków', () => {
  const corpus = seeded();
  const res = corpus.search('czy wraca pobor do wojska');
  assert.ok(res.ok);
  assert.equal(res.items[0]?.url, 'mock://mon.gov.pl/pobor');
  assert.equal(res.items[0]?.isMock, true);
  assert.equal(res.items[0]?.kind, 'corpus');
  assert.match(res.items[0]?.excerpt ?? '', /«/);
  corpus.close();
});

test('brak trafień i puste zapytanie dają pustą listę', () => {
  const corpus = seeded();
  assert.deepEqual(corpus.search('kosmici'), { ok: true, items: [] });
  assert.deepEqual(corpus.search('?!'), { ok: true, items: [] });
  assert.equal(corpus.count(), 2);
  corpus.close();
});
