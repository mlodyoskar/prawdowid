import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { verify } from '@prawdowid/agent';
import { fetchPage, openCorpus, searchFactChecks } from '@prawdowid/sources';
import type { Context } from 'hono';

import { createApp } from './app.ts';
import { loadEnv } from './env.ts';
import { JobRunner, SqliteJobStore } from './jobs.ts';
import { resolveModel } from './model.ts';

const env = loadEnv();
const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));

let model: ReturnType<typeof resolveModel> = null;
try {
  model = resolveModel(env);
} catch (err) {
  log('llm_config_error', { message: err instanceof Error ? err.message : String(err) });
}
if (!model)
  log('llm_not_configured', { hint: 'Ustaw LLM_BASE_URL, LLM_API_KEY i LLM_MODEL w .env' });

mkdirSync(dirname(env.CHECKS_DB_PATH), { recursive: true });
const corpus = openCorpus(env.CORPUS_DB_PATH);
const store = new SqliteJobStore(env.CHECKS_DB_PATH);

const interrupted = store.failInterrupted(new Date());
if (interrupted > 0) log('jobs_interrupted', { count: interrupted });

const purge = () => {
  const removed = store.purgeOlderThan(
    new Date(Date.now() - env.CHECKS_RETENTION_HOURS * 3600_000),
  );
  if (removed > 0) log('jobs_purged', { count: removed });
};
purge();
const purgeTimer = setInterval(purge, 3600_000);
purgeTimer.unref();

const runner = new JobRunner({
  store,
  concurrency: env.MAX_CONCURRENT_CHECKS,
  maxQueued: env.MAX_QUEUED_CHECKS,
  timeoutMs: env.CHECK_TIMEOUT_MS,
  run: (input, options) => {
    if (!model) throw new Error('LLM not configured');
    return verify(
      input,
      {
        model,
        corpus,
        factchecks: (q) => searchFactChecks(q, { apiKey: env.GOOGLE_FACTCHECK_API_KEY }),
        fetchPage: (url) => fetchPage(url),
      },
      options,
    );
  },
  // Log bez treści pytania (minimalizacja danych).
  onDone: (checkId, { response, metrics }) => {
    // Osobne zdarzenie dla każdej wykrytej próby injection: źródło i wzorzec, bez treści.
    for (const signal of metrics.injectionSignals) {
      log('prompt_injection_suspected', {
        checkId,
        source: signal.source,
        pattern: signal.pattern,
      });
    }
    log('check_done', {
      checkId,
      status: response.status,
      durationMs: response.durationMs,
      ...(response.status === 'ok'
        ? {
            verdicts: response.claims.map((c) => c.verdict),
            evidence: response.evidence.map((e) => e.url),
          }
        : {}),
      ...(response.status === 'error' ? { code: response.code } : {}),
      ...metrics,
      injectionSignals: metrics.injectionSignals.length,
    });
  },
});

/** IP klienta. X-Forwarded-For tylko za zaufanym proxy (TRUST_PROXY=true), inaczej łatwo go podrobić. */
const clientKey = (c: Context): string => {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const app = createApp({
  runner,
  store,
  llmConfigured: model !== null,
  health: () => ({
    factchecks: Boolean(env.GOOGLE_FACTCHECK_API_KEY),
    corpusDocuments: corpus.count(),
  }),
  webOrigin: env.WEB_ORIGIN,
  clientKey,
  rateLimit: {
    postPerMinute: env.RATE_LIMIT_PER_MINUTE,
    getPerMinute: env.RATE_LIMIT_GET_PER_MINUTE,
  },
  onRateLimited: (event) => log('rate_limited', event),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) =>
  log('server_started', { port: info.port, corpusDocuments: corpus.count() }),
);

const shutdown = async () => {
  log('server_stopping');
  server.close();
  await runner.shutdown(10_000);
  corpus.close();
  store.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
