import { zValidator } from '@hono/zod-validator';
import { CheckRequest } from '@prawdowid/contracts';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';

import type { JobRunner, JobStore } from './jobs.ts';
import { FixedWindowLimiter, hashClientKey } from './rate-limit.ts';

export type AppDeps = {
  runner: Pick<JobRunner, 'enqueue' | 'delete' | 'stats'>;
  store: Pick<JobStore, 'get'>;
  /** Brak modelu = brak konfiguracji LLM: nie przyjmujemy zadań. */
  llmConfigured: boolean;
  health: () => { factchecks: boolean; corpusDocuments: number; corpusVersion: string | null };
  webOrigin: string;
  /** Identyfikuje klienta do limitowania żądań (zwykle IP). */
  clientKey: (c: Context) => string;
  rateLimit: { postPerMinute: number; getPerMinute: number };
  onRateLimited?: (event: { route: string; client: string }) => void;
  /** Wyłącza logger w testach. */
  quiet?: boolean;
};

function rateLimiter(
  limiter: FixedWindowLimiter,
  route: string,
  deps: Pick<AppDeps, 'clientKey' | 'onRateLimited'>,
): MiddlewareHandler {
  return async (c, next) => {
    const key = deps.clientKey(c);
    const res = limiter.hit(key);
    if (!res.allowed) {
      deps.onRateLimited?.({ route, client: hashClientKey(key) });
      return c.json(
        {
          error: 'rate_limited',
          message: `Za dużo zapytań w krótkim czasie. Spróbuj ponownie za ${res.retryAfterSec} s.`,
        },
        429,
        { 'Retry-After': String(res.retryAfterSec) },
      );
    }
    await next();
    return undefined;
  };
}

const BODY_LIMIT_BYTES = 8 * 1024 * 1024;

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const postLimiter = new FixedWindowLimiter({ limit: deps.rateLimit.postPerMinute });
  const getLimiter = new FixedWindowLimiter({ limit: deps.rateLimit.getPerMinute });

  if (!deps.quiet) app.use(logger());
  // API zwraca tylko JSON: blokujemy osadzanie, sniffing i wysyłanie referera; HSTS na HTTPS.
  app.use(
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: 'DENY',
    }),
  );
  app.use(
    '/api/*',
    cors({
      origin: deps.webOrigin,
      allowMethods: ['GET', 'POST', 'DELETE'],
      // Retry-After is not CORS-safelisted: without this the browser cannot read the polling hint.
      exposeHeaders: ['Retry-After', 'Location'],
    }),
  );

  app.get('/health', (c) =>
    c.json({ ok: true, llm: deps.llmConfigured, sources: deps.health(), queue: deps.runner.stats }),
  );

  app.post(
    '/api/checks',
    rateLimiter(postLimiter, 'POST /api/checks', deps),
    bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
      onError: (c) =>
        c.json(
          { error: 'payload_too_large', message: 'Zgłoszenie jest za duże (limit 8 MB).' },
          413,
        ),
    }),
    zValidator('json', CheckRequest, (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: 'invalid_request',
            message: 'Nieprawidłowe zgłoszenie.',
            issues: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
          400,
        );
      }
      return undefined;
    }),
    (c) => {
      if (!deps.llmConfigured) {
        return c.json(
          { error: 'missing_config', message: 'Usługa nie ma skonfigurowanego modelu językowego.' },
          503,
        );
      }
      const job = deps.runner.enqueue(c.req.valid('json'));
      if (!job) {
        return c.json(
          { error: 'busy', message: 'Zbyt wiele zgłoszeń naraz. Spróbuj za chwilę.' },
          503,
          {
            'Retry-After': '10',
          },
        );
      }
      return c.json(job, 202, { Location: `/api/checks/${job.checkId}` });
    },
  );

  app.get('/api/checks/:checkId', rateLimiter(getLimiter, 'GET /api/checks/:id', deps), (c) => {
    const job = deps.store.get(c.req.param('checkId'));
    if (!job) return c.json({ error: 'not_found', message: 'Nie ma takiego sprawdzenia.' }, 404);
    return c.json(job, 200, job.state === 'done' ? {} : { 'Retry-After': '1' });
  });

  app.delete('/api/checks/:checkId', (c) => {
    const deleted = deps.runner.delete(c.req.param('checkId'));
    return deleted
      ? c.body(null, 204)
      : c.json({ error: 'not_found', message: 'Nie ma takiego sprawdzenia.' }, 404);
  });

  return app;
}
