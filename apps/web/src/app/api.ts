import { CheckJob, type CheckRequest } from '@prawdowid/contracts';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** A failed request. `status` 0 means the API could not be reached at all. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, status: number, code?: string, retryAfterMs?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function readRetryAfter(res: Response): number | undefined {
  const sec = Number(res.headers.get('Retry-After'));
  return Number.isFinite(sec) && sec > 0 ? sec * 1000 : undefined;
}

export async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new ApiError(
      'Nie udało się połączyć z usługą. Sprawdź połączenie z internetem i spróbuj ponownie.',
      0,
      'network',
    );
  }
  if (res.ok) return res;

  // The API answers errors as { error, message } with a message meant for the user.
  const body: unknown = await res.json().catch(() => null);
  const field = (key: string): string | undefined => {
    if (typeof body !== 'object' || body === null) return undefined;
    const value: unknown = Reflect.get(body, key);
    return typeof value === 'string' ? value : undefined;
  };
  const message = field('message') ?? `Usługa zwróciła błąd (${res.status}).`;
  const code = field('error');
  throw new ApiError(message, res.status, code, readRetryAfter(res));
}

async function parseJob(res: Response): Promise<CheckJob> {
  const parsed = CheckJob.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new ApiError('Usługa zwróciła nieoczekiwaną odpowiedź.', res.status, 'bad_response');
  }
  return parsed.data;
}

/** POST /api/checks → 202 with a queued job. */
export async function createCheck(body: CheckRequest, signal?: AbortSignal): Promise<CheckJob> {
  const res = await send('/api/checks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return parseJob(res);
}

/** GET /api/checks/:id. `retryAfterMs` is the server's polling hint while the job runs. */
export async function getCheck(
  checkId: string,
  signal?: AbortSignal,
): Promise<{ job: CheckJob; retryAfterMs: number }> {
  const res = await send(`/api/checks/${encodeURIComponent(checkId)}`, { signal });
  return { job: await parseJob(res), retryAfterMs: readRetryAfter(res) ?? 1000 };
}

/** DELETE /api/checks/:id: removes the stored check. */
export async function deleteCheck(checkId: string): Promise<void> {
  await send(`/api/checks/${encodeURIComponent(checkId)}`, { method: 'DELETE' });
}
