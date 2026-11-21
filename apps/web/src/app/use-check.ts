import type { CheckRequest, CheckResponse } from '@prawdowid/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, createCheck, deleteCheck, getCheck } from './api.ts';

export type CheckState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'waiting'; checkId: string; jobState: 'queued' | 'running' }
  | { phase: 'done'; checkId: string; result: CheckResponse }
  | { phase: 'failed'; title: string; message: string; canRetry: boolean };

/** The server stops a check after ~30 s; past this we stop waiting for it on our side. */
const CLIENT_TIMEOUT_MS = 90_000;
const MAX_TRANSIENT_FAILURES = 5;
const CHECK_PARAM = 'check';

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** The check id lives in the URL (?check=…) so a result can be reloaded and shared. */
export function readCheckParam(): string | null {
  return new URLSearchParams(window.location.search).get(CHECK_PARAM);
}

function writeCheckParam(checkId: string | null) {
  const url = new URL(window.location.href);
  if (checkId) url.searchParams.set(CHECK_PARAM, checkId);
  else url.searchParams.delete(CHECK_PARAM);
  window.history.replaceState(null, '', url);
}

function failure(err: unknown): Extract<CheckState, { phase: 'failed' }> {
  if (!(err instanceof ApiError)) {
    return {
      phase: 'failed',
      title: 'Coś poszło nie tak',
      message: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.',
      canRetry: true,
    };
  }
  const titles: Record<number, string> = {
    0: 'Brak połączenia z usługą',
    400: 'Nie możemy przyjąć tej wiadomości',
    404: 'Nie ma takiego sprawdzenia',
    413: 'Wiadomość jest za duża',
    429: 'Za dużo zapytań',
    503: 'Usługa jest chwilowo niedostępna',
  };
  const notRetryable = err.status === 400 || err.status === 404 || err.status === 413;
  return {
    phase: 'failed',
    title: titles[err.status] ?? 'Sprawdzanie przerwane',
    message:
      err.status === 404
        ? 'Zapis mógł zostać usunięty. Sprawdzenia przechowujemy przez 72 godziny.'
        : err.message,
    canRetry: !notRetryable,
  };
}

/** Runs one check at a time: submit, poll until done, cancel, delete. */
export function useCheck() {
  const [state, setState] = useState<CheckState>({ phase: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const checkIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback((): AbortController => {
    stop();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    return ctrl;
  }, [stop]);

  useEffect(() => stop, [stop]);

  const follow = useCallback(async (checkId: string, signal: AbortSignal) => {
    const deadline = Date.now() + CLIENT_TIMEOUT_MS;
    let transientFailures = 0;
    while (!signal.aborted) {
      try {
        const { job, retryAfterMs } = await getCheck(checkId, signal);
        transientFailures = 0;
        if (signal.aborted) return;
        if (job.state === 'done') {
          setState(
            job.result
              ? { phase: 'done', checkId, result: job.result }
              : failure(new ApiError('Usługa zwróciła nieoczekiwaną odpowiedź.', 200)),
          );
          return;
        }
        setState({ phase: 'waiting', checkId, jobState: job.state });
        if (Date.now() > deadline) {
          setState({
            phase: 'failed',
            title: 'Sprawdzanie trwa zbyt długo',
            message: 'Nie dostaliśmy odpowiedzi na czas. To nie jest ocena Twojej wiadomości.',
            canRetry: true,
          });
          return;
        }
        await sleep(retryAfterMs, signal);
      } catch (err) {
        if (signal.aborted) return;
        const transient = err instanceof ApiError && (err.status === 0 || err.status === 429);
        if (transient && transientFailures < MAX_TRANSIENT_FAILURES) {
          transientFailures += 1;
          await sleep(err.retryAfterMs ?? 2000, signal);
          continue;
        }
        setState(failure(err));
        return;
      }
    }
  }, []);

  const submit = useCallback(
    async (request: CheckRequest) => {
      const ctrl = start();
      setState({ phase: 'submitting' });
      try {
        const job = await createCheck(request, ctrl.signal);
        if (ctrl.signal.aborted) return;
        checkIdRef.current = job.checkId;
        writeCheckParam(job.checkId);
        setState({ phase: 'waiting', checkId: job.checkId, jobState: 'queued' });
        await follow(job.checkId, ctrl.signal);
      } catch (err) {
        if (!ctrl.signal.aborted) setState(failure(err));
      }
    },
    [follow, start],
  );

  /** Opens an existing check, e.g. from a shared link. */
  const open = useCallback(
    async (checkId: string) => {
      const ctrl = start();
      checkIdRef.current = checkId;
      setState({ phase: 'waiting', checkId, jobState: 'queued' });
      await follow(checkId, ctrl.signal);
    },
    [follow, start],
  );

  const reset = useCallback(() => {
    stop();
    checkIdRef.current = null;
    writeCheckParam(null);
    setState({ phase: 'idle' });
  }, [stop]);

  /** Stops waiting and deletes the check on the server (best effort). */
  const cancel = useCallback(() => {
    const checkId = checkIdRef.current;
    reset();
    if (checkId) deleteCheck(checkId).catch(() => undefined);
  }, [reset]);

  /** Deletes the stored check. Resolves to false when the server refused. */
  const remove = useCallback(async (): Promise<boolean> => {
    const checkId = checkIdRef.current;
    if (!checkId) return false;
    try {
      await deleteCheck(checkId);
    } catch {
      return false;
    }
    reset();
    return true;
  }, [reset]);

  return { state, submit, open, reset, cancel, remove };
}
