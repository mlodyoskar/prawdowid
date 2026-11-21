/**
 * Buduje korpus od zera ze snapshotu JSONL przygotowanego przez scraper.
 * Nowy plik bazy powstaje obok i dopiero po udanym imporcie zastępuje stary,
 * więc błąd w snapshocie nie zostawia korpusu w połowie.
 *
 * Użycie: pnpm --filter @prawdowid/sources seed [ścieżka-do-snapshotu]
 *   CORPUS_SNAPSHOT_PATH  snapshot (domyślnie data/corpus/snapshot.jsonl)
 *   CORPUS_DB_PATH        plik bazy (domyślnie data/corpus.db)
 */
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { corpusSources } from '../../../data/sources.ts';
import { ensureSchema } from '../src/corpus.ts';
import { importSnapshot, SnapshotError } from '../src/snapshot.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const snapshotPath = resolve(
  repoRoot,
  process.argv[2] ?? process.env['CORPUS_SNAPSHOT_PATH'] ?? 'data/corpus/snapshot.jsonl',
);
const dbPath = resolve(repoRoot, process.env['CORPUS_DB_PATH'] ?? 'data/corpus.db');
const tmpPath = `${dbPath}.import-${process.pid}`;

const sources = corpusSources();
mkdirSync(dirname(dbPath), { recursive: true });
rmSync(tmpPath, { force: true });

const db = new DatabaseSync(tmpPath);
try {
  ensureSchema(db);
  const report = importSnapshot(db, readFileSync(snapshotPath, 'utf8'), {
    sources,
    importedAt: new Date(),
  });
  db.close();
  renameSync(tmpPath, dbPath);

  console.log(`Korpus: ${dbPath}`);
  console.log(
    `Wersja ${report.version}: ${report.documents} dokumentów, ${report.fragments} fragmentów, ` +
      `${report.withoutPublicationDate} bez daty publikacji.`,
  );
  for (const [id, count] of Object.entries(report.bySource).toSorted((a, b) => b[1] - a[1])) {
    const source = sources.get(id);
    console.log(`  ${String(count).padStart(4)}  ${id}  (${source?.name}; ${source?.licence})`);
  }
} catch (err) {
  try {
    db.close();
  } catch {
    // baza mogła być już zamknięta
  }
  rmSync(tmpPath, { force: true });
  console.error(err instanceof SnapshotError ? err.message : err);
  console.error(`Import przerwany. Dotychczasowy korpus (${dbPath}) nie został zmieniony.`);
  process.exitCode = 1;
}
