import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { emptyMetrics, maskPii, type VerifyMetrics, type VerifyResult } from '@prawdowid/agent';
import {
  CheckResponse,
  type CheckJob,
  type CheckRequest,
  type JobState,
} from '@prawdowid/contracts';

/**
 * Magazyn zadań. Tabela `checks` to jednocześnie zapis przebiegu sprawdzenia z MVP:
 * pytanie, czas, użyte źródła (w result_json) i wynik. Obrazu nie zapisujemy, tylko `has_image`.
 */
export interface JobStore {
  create(id: string, input: CheckRequest, now: Date): CheckJob;
  markRunning(id: string, now: Date): void;
  complete(id: string, result: CheckResponse, metrics: VerifyMetrics | null, now: Date): void;
  get(id: string): CheckJob | undefined;
  delete(id: string): boolean;
  /** Zadania przerwane restartem: oznacza je jako zakończone błędem. */
  failInterrupted(now: Date): number;
  purgeOlderThan(cutoff: Date): number;
  close(): void;
}

type Row = {
  id: string;
  state: JobState;
  created_at: string;
  updated_at: string;
  result_json: string | null;
};

export class SqliteJobStore implements JobStore {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS checks (
        id          TEXT PRIMARY KEY,
        state       TEXT NOT NULL CHECK (state IN ('queued', 'running', 'done')),
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        input_text  TEXT,
        has_image   INTEGER NOT NULL DEFAULT 0,
        result_json TEXT,
        status      TEXT,
        duration_ms INTEGER,
        metrics_json TEXT
      );
      CREATE INDEX IF NOT EXISTS checks_created_at ON checks(created_at);
    `);
  }

  create(id: string, input: CheckRequest, now: Date): CheckJob {
    const ts = now.toISOString();
    this.#db
      .prepare(
        'INSERT INTO checks (id, state, created_at, updated_at, input_text, has_image) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, 'queued', ts, ts, input.text ? maskPii(input.text).text : null, input.image ? 1 : 0);
    return { checkId: id, state: 'queued', createdAt: ts, updatedAt: ts };
  }

  markRunning(id: string, now: Date): void {
    this.#db
      .prepare("UPDATE checks SET state = 'running', updated_at = ? WHERE id = ?")
      .run(now.toISOString(), id);
  }

  complete(id: string, result: CheckResponse, metrics: VerifyMetrics | null, now: Date): void {
    this.#db
      .prepare(
        `UPDATE checks SET state = 'done', updated_at = ?, result_json = ?, status = ?, duration_ms = ?, metrics_json = ?
         WHERE id = ?`,
      )
      .run(
        now.toISOString(),
        JSON.stringify(result),
        result.status,
        result.durationMs,
        metrics ? JSON.stringify(metrics) : null,
        id,
      );
  }

  get(id: string): CheckJob | undefined {
    const row = this.#db
      .prepare('SELECT id, state, created_at, updated_at, result_json FROM checks WHERE id = ?')
      .get(id) as Row | undefined;
    if (!row) return undefined;
    return {
      checkId: row.id,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.result_json ? { result: CheckResponse.parse(JSON.parse(row.result_json)) } : {}),
    };
  }

  /** Zapisane (zamaskowane) pytanie: do audytu przebiegu sprawdzenia. */
  inputText(id: string): string | null {
    const row = this.#db.prepare('SELECT input_text FROM checks WHERE id = ?').get(id);
    return typeof row?.['input_text'] === 'string' ? row['input_text'] : null;
  }

  delete(id: string): boolean {
    return this.#db.prepare('DELETE FROM checks WHERE id = ?').run(id).changes > 0;
  }

  failInterrupted(now: Date): number {
    const rows = this.#db
      .prepare("SELECT id, created_at FROM checks WHERE state IN ('queued', 'running')")
      .all() as Array<{ id: string; created_at: string }>;
    for (const row of rows) {
      this.complete(
        row.id,
        {
          checkId: row.id,
          createdAt: row.created_at,
          durationMs: now.getTime() - Date.parse(row.created_at),
          status: 'error',
          code: 'internal',
          message:
            'Sprawdzenie zostało przerwane przez restart serwera. Wyślij zgłoszenie ponownie.',
        },
        null,
        now,
      );
    }
    return rows.length;
  }

  purgeOlderThan(cutoff: Date): number {
    return Number(
      this.#db.prepare('DELETE FROM checks WHERE created_at < ?').run(cutoff.toISOString()).changes,
    );
  }

  close(): void {
    this.#db.close();
  }
}

export type RunCheck = (
  input: CheckRequest,
  options: { checkId: string; abortSignal: AbortSignal },
) => Promise<VerifyResult>;

export type JobRunnerOptions = {
  store: JobStore;
  run: RunCheck;
  concurrency: number;
  maxQueued: number;
  timeoutMs: number;
  now?: () => Date;
  onDone?: (checkId: string, result: VerifyResult) => void;
};

type QueuedJob = { id: string; input: CheckRequest };

/**
 * Kolejka w procesie z limitem współbieżności i timeoutem zadania.
 * Wejście (łącznie z obrazem) żyje tylko w pamięci do końca zadania.
 */
export class JobRunner {
  readonly #opts: Required<Omit<JobRunnerOptions, 'onDone'>> & Pick<JobRunnerOptions, 'onDone'>;
  readonly #queue: QueuedJob[] = [];
  readonly #running = new Map<string, { controller: AbortController; done: Promise<void> }>();
  #accepting = true;

  constructor(options: JobRunnerOptions) {
    this.#opts = { now: () => new Date(), ...options };
  }

  /** Dodaje zadanie. Zwraca `null`, gdy kolejka jest pełna albo serwer się zamyka. */
  enqueue(input: CheckRequest): CheckJob | null {
    if (!this.#accepting || this.#queue.length >= this.#opts.maxQueued) return null;
    const id = randomUUID();
    const job = this.#opts.store.create(id, input, this.#opts.now());
    this.#queue.push({ id, input });
    this.#pump();
    return job;
  }

  /** Usuwa zadanie (i przerywa je, jeśli trwa). */
  delete(id: string): boolean {
    const idx = this.#queue.findIndex((j) => j.id === id);
    if (idx >= 0) this.#queue.splice(idx, 1);
    this.#running.get(id)?.controller.abort();
    return this.#opts.store.delete(id);
  }

  get stats() {
    return { queued: this.#queue.length, running: this.#running.size };
  }

  /** Przestaje przyjmować zadania i czeka na trwające (maksymalnie `graceMs`). */
  async shutdown(graceMs: number): Promise<void> {
    this.#accepting = false;
    this.#queue.length = 0;
    const all = Promise.allSettled([...this.#running.values()].map((r) => r.done));
    await Promise.race([all, new Promise((r) => setTimeout(r, graceMs).unref())]);
  }

  #pump(): void {
    while (this.#running.size < this.#opts.concurrency) {
      const job = this.#queue.shift();
      if (!job) break;
      const controller = new AbortController();
      const done = this.#execute(job, controller).finally(() => {
        this.#running.delete(job.id);
        this.#pump();
      });
      this.#running.set(job.id, { controller, done });
    }
  }

  async #execute({ id, input }: QueuedJob, controller: AbortController): Promise<void> {
    const { store, run, now, timeoutMs } = this.#opts;
    const startedAt = now();
    store.markRunning(id, startedAt);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);

    let result: VerifyResult;
    try {
      result = await run(input, { checkId: id, abortSignal: signal });
    } catch {
      // verify() nie powinno rzucać, ale nie zostawiamy zadania w stanie `running`.
      result = {
        response: {
          checkId: id,
          createdAt: startedAt.toISOString(),
          durationMs: now().getTime() - startedAt.getTime(),
          status: 'error',
          code: signal.aborted ? 'timeout' : 'internal',
          message: signal.aborted
            ? 'Sprawdzenie trwało zbyt długo i zostało przerwane. Spróbuj ponownie.'
            : 'Wystąpił błąd techniczny podczas sprawdzania. To nie jest wynik sprawdzenia.',
        },
        metrics: emptyMetrics(),
      };
    }
    if (controller.signal.aborted) return; // zadanie usunięte w trakcie
    store.complete(id, result.response, result.metrics, now());
    this.#opts.onDone?.(id, result);
  }
}
