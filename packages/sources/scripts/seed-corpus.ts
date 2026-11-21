/**
 * Wypełnia korpus danymi mockowymi z `data/corpus.mock.json`.
 * Mocki mają URL-e `mock://…` i flagę `is_mock`, więc nigdy nie udają prawdziwego źródła.
 * Użycie: pnpm --filter @prawdowid/sources seed   (ścieżka z CORPUS_DB_PATH, domyślnie data/corpus.db w katalogu repo)
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ensureSchema, insertDocument, type CorpusDocument } from '../src/corpus.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const dbPath = resolve(repoRoot, process.env['CORPUS_DB_PATH'] ?? 'data/corpus.db');
const mockPath = resolve(import.meta.dirname, '../data/corpus.mock.json');

const docs = JSON.parse(readFileSync(mockPath, 'utf8')) as Omit<
  CorpusDocument,
  'fetchedAt' | 'isMock'
>[];
const fetchedAt = new Date().toISOString();

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
ensureSchema(db);
db.exec('BEGIN');
for (const doc of docs) insertDocument(db, { ...doc, fetchedAt, isMock: true });
db.exec('COMMIT');
const { n } = db.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number };
db.close();

console.log(`Korpus: ${dbPath} (${docs.length} mocków wczytanych, ${n} dokumentów łącznie)`);
