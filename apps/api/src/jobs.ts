import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { emptyMetrics, maskPii, type VerifyMetrics, type VerifyResult } from '@prawdowid/agent';
import {
  CheckResponse,
  type CheckJob,
  type CheckRequest,
  type JobState,
} from '@prawdowid/contracts';

import { reuseResponse } from './reuse.ts';

/**
 * Magazyn zadań. Tabela `checks` to jednocześnie zapis przebiegu sprawdzenia z MVP:
 * pytanie, czas, użyte źródła (w result_json) i wynik. Obrazu nie zapisujemy, tylko `has_image`.
 */
export interface JobStore {
  /** `reuseKey`: klucz znormalizowanego zgłoszenia (reuse.ts), po którym szukamy gotowego wyniku. */
  create(id: string, input: CheckRequest, now: Date, reuseKey?: string | null): CheckJob;
  markRunning(id: string, now: Date): void;
  /** `reusable`: wynik może zostać skopiowany dla kolejnego takiego samego zgłoszenia. */
  complete(
    id: string,
    result: CheckResponse,
    metrics: VerifyMetrics | null,
    now: Date,
    reusable?: boolean,
  ): void;
  get(id: string): CheckJob | undefined;
  /** Najstarszy wynik nadający się do ponownego użycia, zakończony nie wcześniej niż `since`. */
  findReusable(reuseKey: string, since: Date): VerifyResult | undefined;
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
    // Kolumny ponownego użycia wyniku: dokładane do istniejącej bazy (wolumen na Railway).
    const columns = new Set(
      (this.#db.prepare('PRAGMA table_info(checks)').all() as Array<{ name: string }>).map(
        (c) => c.name,
      ),
    );
    if (!columns.has('reuse_key')) this.#db.exec('ALTER TABLE checks ADD COLUMN reuse_key TEXT');
    if (!columns.has('reusable')) {
      this.#db.exec('ALTER TABLE checks ADD COLUMN reusable INTEGER NOT NULL DEFAULT 0');
    }
    this.#db.exec(
      'CREATE INDEX IF NOT EXISTS checks_reuse ON checks(reuse_key, updated_at) WHERE reusable = 1',
    );
  }

  create(id: string, input: CheckRequest, now: Date, reuseKey: string | null = null): CheckJob {
    const ts = now.toISOString();
    this.#db
      .prepare(
        'INSERT INTO checks (id, state, created_at, updated_at, input_text, has_image, reuse_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        'queued',
        ts,
        ts,
        input.text ? maskPii(input.text).text : null,
        input.image ? 1 : 0,
        reuseKey,
      );
    return { checkId: id, state: 'queued', createdAt: ts, updatedAt: ts };
  }

  markRunning(id: string, now: Date): void {
    this.#db
      .prepare("UPDATE checks SET state = 'running', updated_at = ? WHERE id = ?")
      .run(now.toISOString(), id);
  }

  complete(
    id: string,
    result: CheckResponse,
    metrics: VerifyMetrics | null,
    now: Date,
    reusable = false,
  ): void {
    this.#db
      .prepare(
        `UPDATE checks SET state = 'done', updated_at = ?, result_json = ?, status = ?, duration_ms = ?, metrics_json = ?, reusable = ?
         WHERE id = ?`,
      )
      .run(
        now.toISOString(),
        JSON.stringify(result),
        result.status,
        result.durationMs,
        metrics ? JSON.stringify(metrics) : null,
        reusable && result.status === 'ok' ? 1 : 0,
        id,
      );
  }

  findReusable(reuseKey: string, since: Date): VerifyResult | undefined {
    const row = this.#db
      .prepare(
        `SELECT result_json, metrics_json FROM checks
         WHERE reuse_key = ? AND reusable = 1 AND state = 'done' AND updated_at >= ?
         ORDER BY updated_at ASC LIMIT 1`,
      )
      .get(reuseKey, since.toISOString()) as
      | { result_json: string | null; metrics_json: string | null }
      | undefined;
    if (!row?.result_json) return undefined;
    return {
      response: CheckResponse.parse(JSON.parse(row.result_json)),
      metrics: row.metrics_json
        ? { ...emptyMetrics(), ...(JSON.parse(row.metrics_json) as Partial<VerifyMetrics>) }
        : emptyMetrics(),
    };
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
  /** Zadanie usunięte (usunięcie sesji w dowolnym kanale): sprzątanie danych pochodnych. */
  onDelete?: (checkId: string) => void;
  /**
   * Ponowne użycie wyniku (reuse.ts): klucz zgłoszenia albo `null`, gdy zgłoszenia nie łączymy.
   * Bez tej opcji każde zgłoszenie jest sprawdzane od nowa.
   */
  reuse?: {
    key: (input: CheckRequest) => string | null;
    ttlMs: number;
    isReusable: (result: VerifyResult) => boolean;
  };
};

type QueuedJob = { id: string; input: CheckRequest; key: string | null };

/** Sprawdzenie w toku i zgłoszenia o tym samym kluczu, które czekają na jego wynik. */
type InFlight = { leader: string; followers: QueuedJob[] };

/**
 * Kolejka w procesie z limitem współbieżności i timeoutem zadania.
 * Wejście (łącznie z obrazem) żyje tylko w pamięci do końca zadania.
 *
 * To samo zgłoszenie (ten sam klucz `reuse`) nie jest sprawdzane drugi raz: dostaje kopię
 * gotowego wyniku albo dołącza do sprawdzenia, które właśnie trwa. Działa to w obrębie jednego
 * procesu i jednej bazy, czyli przy jednej replice API. Kopiujemy tylko pełne wyniki merytoryczne;
 * po awarii każde czekające zgłoszenie jest sprawdzane samodzielnie.
 */
export class JobRunner {
  readonly #opts: Required<Omit<JobRunnerOptions, 'onDone' | 'onDelete' | 'reuse'>> &
    Pick<JobRunnerOptions, 'onDone' | 'onDelete' | 'reuse'>;
  readonly #queue: QueuedJob[] = [];
  readonly #running = new Map<string, { controller: AbortController; done: Promise<void> }>();
  readonly #inFlight = new Map<string, InFlight>();
  #accepting = true;

  constructor(options: JobRunnerOptions) {
    this.#opts = { now: () => new Date(), ...options };
  }

  /** Dodaje zadanie. Zwraca `null`, gdy kolejka jest pełna albo serwer się zamyka. */
  enqueue(input: CheckRequest): CheckJob | null {
    if (!this.#accepting) return null;
    const { store, now, reuse } = this.#opts;
    const key = reuse?.key(input) ?? null;
    const id = randomUUID();

    if (key && reuse) {
      const createdAt = now();
      const ready = store.findReusable(key, new Date(createdAt.getTime() - reuse.ttlMs));
      if (ready) {
        store.create(id, input, createdAt, key);
        this.#completeReused(id, ready, createdAt);
        return store.get(id) ?? null;
      }
      const pending = this.#inFlight.get(key);
      if (pending) {
        const job = store.create(id, input, createdAt, key);
        pending.followers.push({ id, input, key });
        return job;
      }
    }

    if (this.#queue.length >= this.#opts.maxQueued) return null;
    const job = store.create(id, input, now(), key);
    if (key) this.#inFlight.set(key, { leader: id, followers: [] });
    this.#queue.push({ id, input, key });
    this.#pump();
    return job;
  }

  /** Usuwa zadanie (i przerywa je, jeśli trwa). */
  delete(id: string): boolean {
    const idx = this.#queue.findIndex((j) => j.id === id);
    if (idx >= 0) {
      const [job] = this.#queue.splice(idx, 1);
      if (job) this.#settle(job, null);
    }
    for (const flight of this.#inFlight.values()) {
      flight.followers = flight.followers.filter((f) => f.id !== id);
    }
    this.#running.get(id)?.controller.abort();
    this.#opts.onDelete?.(id);
    return this.#opts.store.delete(id);
  }

  get stats() {
    return { queued: this.#queue.length, running: this.#running.size };
  }

  /** Przestaje przyjmować zadania i czeka na trwające (maksymalnie `graceMs`). */
  async shutdown(graceMs: number): Promise<void> {
    this.#accepting = false;
    this.#queue.length = 0;
    this.#inFlight.clear();
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

  /** Kopia gotowego wyniku. `onDone` po bieżącym zdarzeniu: wołający najpierw dostaje numer zadania. */
  #completeReused(id: string, source: VerifyResult, createdAt: Date): void {
    const response = reuseResponse(source.response, id, createdAt);
    // Kopia nie woła modelu ani źródeł (zero tokenów i kosztu), ale treść zgłoszenia jest ta sama:
    // przejmuje sygnały injection (log `prompt_injection_suspected`) i rodzaje ukrytych danych osobowych.
    const metrics: VerifyMetrics = {
      ...emptyMetrics(),
      injectionSignals: source.metrics.injectionSignals,
      piiMasked: source.metrics.piiMasked,
      reused: true,
    };
    this.#opts.store.complete(id, response, metrics, this.#opts.now(), true);
    setImmediate(() => this.#opts.onDone?.(id, { response, metrics }));
  }

  /**
   * Sprawdzenie prowadzące się skończyło (albo zostało usunięte): czekające zgłoszenia dostają
   * kopię pełnego wyniku, a w każdym innym przypadku trafiają do kolejki jako osobne sprawdzenia.
   */
  #settle(job: QueuedJob, result: VerifyResult | null): void {
    if (!job.key) return;
    const flight = this.#inFlight.get(job.key);
    if (!flight || flight.leader !== job.id) return;
    this.#inFlight.delete(job.key);
    if (result && this.#opts.reuse?.isReusable(result)) {
      for (const f of flight.followers) this.#completeReused(f.id, result, this.#opts.now());
      return;
    }
    if (!this.#accepting || flight.followers.length === 0) return;
    const [next, ...rest] = flight.followers;
    if (!next) return;
    this.#inFlight.set(job.key, { leader: next.id, followers: rest });
    this.#queue.push(next);
    this.#pump();
  }

  async #execute(job: QueuedJob, controller: AbortController): Promise<void> {
    const { id, input } = job;
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
    if (controller.signal.aborted) {
      // Zadanie usunięte w trakcie: jego wyniku nie zapisujemy ani nie kopiujemy.
      this.#settle(job, null);
      return;
    }
    const reusable = Boolean(job.key && this.#opts.reuse?.isReusable(result));
    store.complete(id, result.response, result.metrics, now(), reusable);
    this.#opts.onDone?.(id, result);
    this.#settle(job, result);
  }
}
