import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { ensureSchema } from './corpus.ts';
import { importSnapshot, parseSnapshot, SnapshotError } from './snapshot.ts';

const SOURCES = new Map([['govpl-gis', { licence: 'CC BY-SA 4.0' }]]);

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-0001',
    zrodlo_id: 'govpl-gis',
    url: 'https://www.gov.pl/web/gis/ostrzezenie-kubek',
    tytul: 'Ostrzeżenie publiczne: kubek z melaminy',
    wydawca: 'Główny Inspektorat Sanitarny',
    instytucja: 'Główny Inspektorat Sanitarny',
    klasa_zrodla: 'urzedowe',
    rola_dowodu: 'komunikat_urzedowy',
    data_publikacji: '2026-11-18',
    data_aktualizacji: null,
    data_pobrania: '2026-11-21',
    hash_tresci: 'abc123',
    wersja_korpusu: 'snapshot-test',
    fragmenty: [
      { id: 'doc-0001-f01', tekst: 'Stwierdzono migrację formaldehydu z kubka z melaminy.' },
      { id: 'doc-0001-f02', tekst: 'Numer partii: 874197. Nie należy używać kubków.' },
    ],
    ocena_zrodla: null,
    ...overrides,
  };
}

const jsonl = (...rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n');

function problemsOf(text: string): readonly string[] {
  try {
    parseSnapshot(text, SOURCES);
  } catch (err) {
    assert.ok(err instanceof SnapshotError);
    return err.problems;
  }
  return assert.fail('oczekiwano SnapshotError');
}

test('poprawny wiersz staje się dokumentem z fragmentami i metadanymi', () => {
  const { version, documents } = parseSnapshot(`${jsonl(row())}\n\n`, SOURCES);
  assert.equal(version, 'snapshot-test');
  assert.equal(documents.length, 1);
  assert.deepEqual(documents[0], {
    url: 'https://www.gov.pl/web/gis/ostrzezenie-kubek',
    title: 'Ostrzeżenie publiczne: kubek z melaminy',
    publisher: 'Główny Inspektorat Sanitarny',
    sourceType: 'primary',
    publishedAt: '2026-11-18',
    fetchedAt: '2026-11-21',
    fragments: [
      { id: 'doc-0001-f01', text: 'Stwierdzono migrację formaldehydu z kubka z melaminy.' },
      { id: 'doc-0001-f02', text: 'Numer partii: 874197. Nie należy używać kubków.' },
    ],
    sourceId: 'govpl-gis',
    externalId: 'doc-0001',
    institution: 'Główny Inspektorat Sanitarny',
    updatedAt: null,
    contentHash: 'abc123',
    rating: null,
  });
});

test('dokument wtórny z oceną fact-checkera zachowuje ocenę', () => {
  const { documents } = parseSnapshot(
    jsonl(row({ klasa_zrodla: 'wtorne', ocena_zrodla: ' Fałsz ' })),
    SOURCES,
  );
  assert.equal(documents[0]?.sourceType, 'secondary');
  assert.equal(documents[0]?.rating, 'Fałsz');
});

test('błędy z całego pliku są zbierane z numerami wierszy', () => {
  const problems = problemsOf(
    [
      JSON.stringify(row()),
      '{ to nie json',
      JSON.stringify(row({ id: 'doc-0002', url: 'ftp://example.org/x' })),
      JSON.stringify(row({ id: 'doc-0003', url: 'https://a.example/3', zrodlo_id: 'nieznane' })),
      JSON.stringify(row({ id: 'doc-0004', url: 'https://a.example/4', klasa_zrodla: 'blog' })),
      JSON.stringify(row({ id: 'doc-0005', url: 'https://a.example/5', fragmenty: [] })),
      JSON.stringify(row({ id: 'doc-0006', url: 'https://a.example/6', data_pobrania: 'wczoraj' })),
      JSON.stringify(row({ id: 'doc-0007' })),
    ].join('\n'),
  );
  const text = problems.join('\n');
  assert.match(text, /wiersz 2: to nie jest poprawny JSON/);
  assert.match(text, /wiersz 3: url: oczekiwany adres http\(s\)/);
  assert.match(text, /wiersz 4: zrodlo_id „nieznane” nie ma w katalogu/);
  assert.match(text, /wiersz 5: nieznana klasa_zrodla „blog”/);
  assert.match(text, /wiersz 6: fragmenty: dokument bez fragmentów/);
  assert.match(text, /wiersz 7: data_pobrania/);
  assert.match(text, /wiersz 8: ten sam url co w wierszu 1/);
});

test('powtórzone id, za długi fragment, kilka wersji i pusty plik zatrzymują import', () => {
  assert.match(
    problemsOf(jsonl(row(), row({ url: 'https://a.example/2' }))).join('\n'),
    /wiersz 2: to samo id co w wierszu 1/,
  );
  assert.match(
    problemsOf(jsonl(row({ fragmenty: [{ id: 'f1', tekst: 'a'.repeat(601) }] }))).join('\n'),
    /fragment f1 ma 601 znaków \(limit 600\)/,
  );
  assert.match(
    problemsOf(
      jsonl(row(), row({ id: 'doc-0002', url: 'https://a.example/2', wersja_korpusu: 'inna' })),
    ).join('\n'),
    /kilka wersji korpusu/,
  );
  assert.deepEqual(problemsOf('\n'), ['plik nie zawiera dokumentów']);
});

test('import zapisuje dokumenty, wersję i raport', () => {
  const db = new DatabaseSync(':memory:');
  ensureSchema(db);
  const report = importSnapshot(
    db,
    jsonl(row(), row({ id: 'doc-0002', url: 'https://a.example/2', data_publikacji: null })),
    { sources: SOURCES, importedAt: new Date('2026-11-21T12:00:00Z') },
  );
  assert.deepEqual(report, {
    version: 'snapshot-test',
    documents: 2,
    fragments: 4,
    bySource: { 'govpl-gis': 2 },
    withoutPublicationDate: 1,
  });
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  assert.equal(count('documents'), 2);
  assert.equal(count('fragments'), 4);
  assert.equal(count('fragments_fts'), 4);
  const meta = db.prepare("SELECT value FROM meta WHERE key = 'corpus_version'").get();
  assert.deepEqual({ ...meta }, { value: 'snapshot-test' });
  db.close();
});

test('błędny snapshot niczego nie zapisuje', () => {
  const db = new DatabaseSync(':memory:');
  ensureSchema(db);
  assert.throws(
    () =>
      importSnapshot(db, jsonl(row(), row({ id: 'doc-0002', zrodlo_id: 'nieznane' })), {
        sources: SOURCES,
        importedAt: new Date(),
      }),
    SnapshotError,
  );
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number };
  assert.equal(n, 0);
  db.close();
});
