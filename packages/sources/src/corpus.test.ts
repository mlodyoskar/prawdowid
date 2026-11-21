import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import {
  CorpusSchemaError,
  ensureSchema,
  insertDocument,
  openCorpus,
  setCorpusMeta,
  type CorpusDocument,
} from './corpus.ts';

function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'corpus-')), 'c.db');
}

const POBOR: CorpusDocument = {
  url: 'mock://mon.gov.pl/pobor',
  title: 'MON dementuje informacje o przywróceniu poboru',
  publisher: 'MON',
  sourceType: 'primary',
  publishedAt: '2026-11-07',
  fetchedAt: '2026-11-21T00:00:00Z',
  content: 'Ministerstwo nie prowadzi prac nad przywróceniem obowiązkowej służby wojskowej.',
  isMock: true,
};

const OBWODNICA: CorpusDocument = {
  url: 'https://example.gov.pl/obwodnica',
  title: 'Otwarcie obwodnicy Morawicy',
  publisher: 'Ministerstwo Infrastruktury',
  sourceType: 'primary',
  publishedAt: '2026-11-18',
  fetchedAt: '2026-11-21',
  fragments: [
    { id: 'doc-1-f01', text: 'Otwarcie obwodnicy Morawicy. Kierowcy pojadą nową trasą od piątku.' },
    { id: 'doc-1-f02', text: 'W uroczystości wzięli udział przedstawiciele samorządu.' },
    { id: 'doc-1-f03', text: 'Nowa obwodnica ma 8,6 km długości i dwa węzły drogowe.' },
    { id: 'doc-1-f04', text: 'Obwodnica odciąży centrum miejscowości z ruchu tranzytowego.' },
  ],
};

function seeded(...docs: CorpusDocument[]) {
  const path = tempDbPath();
  const db = new DatabaseSync(path);
  ensureSchema(db);
  for (const doc of docs) insertDocument(db, doc);
  db.close();
  return openCorpus(path);
}

test('znajduje dokument mimo odmiany i braku polskich znaków', () => {
  const corpus = seeded(POBOR, OBWODNICA);
  const res = corpus.search('czy wraca pobor do wojska');
  assert.ok(res.ok);
  assert.equal(res.items[0]?.url, 'mock://mon.gov.pl/pobor');
  assert.equal(res.items[0]?.isMock, true);
  assert.equal(res.items[0]?.kind, 'corpus');
  corpus.close();
});

test('zwraca cały fragment z faktem ze środka dokumentu, bez znaczników trafień', () => {
  const corpus = seeded(POBOR, OBWODNICA);
  const res = corpus.search('obwodnica Morawicy długość km');
  assert.ok(res.ok);
  const hit = res.items.find((item) => item.fragmentId === 'doc-1-f03');
  assert.equal(hit?.excerpt, 'Nowa obwodnica ma 8,6 km długości i dwa węzły drogowe.');
  assert.equal(hit?.title, 'Otwarcie obwodnicy Morawicy');
  assert.ok(res.items.every((item) => !/[«»]/.test(item.excerpt)));
  corpus.close();
});

test('z jednego dokumentu trafiają najwyżej dwa fragmenty', () => {
  const corpus = seeded(OBWODNICA);
  const res = corpus.search('obwodnica');
  assert.ok(res.ok);
  assert.equal(res.items.length, 2);
  assert.equal(new Set(res.items.map((item) => item.fragmentId)).size, 2);
  corpus.close();
});

test('fragments() zwraca kolejne fragmenty dokumentu, a dla nieznanego adresu nic', () => {
  const corpus = seeded(POBOR, OBWODNICA);
  const res = corpus.fragments(OBWODNICA.url);
  assert.ok(res.ok);
  assert.deepEqual(
    res.items.map((item) => item.fragmentId),
    ['doc-1-f01', 'doc-1-f02', 'doc-1-f03', 'doc-1-f04'],
  );
  const limited = corpus.fragments(OBWODNICA.url, { limit: 2 });
  assert.ok(limited.ok);
  assert.equal(limited.items.length, 2);
  assert.deepEqual(corpus.fragments('https://example.gov.pl/nie-ma'), { ok: true, items: [] });
  corpus.close();
  assert.equal(corpus.fragments(OBWODNICA.url).ok, false);
});

test('treść bez gotowych fragmentów jest dzielona, a fragment dostaje numer', () => {
  const corpus = seeded(POBOR);
  const res = corpus.search('pobór');
  assert.ok(res.ok);
  assert.equal(res.items[0]?.fragmentId, 'f01');
  assert.deepEqual(corpus.info(), { documents: 1, fragments: 1, version: null, importedAt: null });
  corpus.close();
});

test('ponowne wstawienie tego samego URL zastępuje dokument i jego fragmenty', () => {
  const path = tempDbPath();
  const db = new DatabaseSync(path);
  ensureSchema(db);
  insertDocument(db, OBWODNICA);
  insertDocument(db, {
    ...OBWODNICA,
    fragments: [{ id: 'doc-9-f01', text: 'Termin otwarcia obwodnicy przesunięto na grudzień.' }],
  });
  setCorpusMeta(db, { version: 'v-test', importedAt: '2026-11-21T10:00:00.000Z' });
  db.close();

  const corpus = openCorpus(path);
  assert.deepEqual(corpus.info(), {
    documents: 1,
    fragments: 1,
    version: 'v-test',
    importedAt: '2026-11-21T10:00:00.000Z',
  });
  assert.deepEqual(corpus.search('węzły drogowe'), { ok: true, items: [] });
  const res = corpus.search('grudzień');
  assert.ok(res.ok);
  assert.equal(res.items[0]?.fragmentId, 'doc-9-f01');
  corpus.close();
});

test('dokument bez treści jest odrzucany', () => {
  const db = new DatabaseSync(':memory:');
  ensureSchema(db);
  assert.throws(() => insertDocument(db, { ...POBOR, content: '   ' }), /bez treści/);
  db.close();
});

test('brak trafień i puste zapytanie dają pustą listę', () => {
  const corpus = seeded(POBOR, OBWODNICA);
  assert.deepEqual(corpus.search('kosmici'), { ok: true, items: [] });
  assert.deepEqual(corpus.search('?!'), { ok: true, items: [] });
  assert.equal(corpus.count(), 2);
  corpus.close();
});

test('plik korpusu w starym formacie daje czytelny błąd zamiast pustych wyników', () => {
  const path = tempDbPath();
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE documents (id INTEGER PRIMARY KEY, url TEXT, content TEXT)');
  db.close();
  assert.throws(() => openCorpus(path), CorpusSchemaError);
});

test('awaria bazy podczas wyszukiwania to status źródła, nie pusty wynik', () => {
  const broken = seeded(POBOR);
  broken.close();
  const res = broken.search('pobór');
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'unavailable');
});
