import { CheckRequest, MAX_TEXT_LENGTH } from '@prawdowid/contracts';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';

import {
  AppHeader,
  Button,
  describedBy,
  Eyebrow,
  Field,
  ICON_STROKE,
  Notice,
  Steps,
  Textarea,
} from '@/ui';

import { CheckResult } from './check-result.tsx';
import { IMAGE_ACCEPT, readImage, type AttachedImage } from './image-input.ts';
import { SiteFooter } from './site-footer.tsx';
import { readCheckParam, useCheck, type CheckState } from './use-check.ts';

const SOURCES_LINE =
  'komunikaty rządu i ministerstw (gov.pl) · MSZ Odyseusz · RCB · Regionalny System Ostrzegania · CERT Polska · Policja';

const STEPS = [
  'Wysyłamy wiadomość',
  'Czekamy na swoją kolej',
  'Szukamy w źródłach urzędowych i serwisach fact-checkingowych',
] as const;

function currentStep(state: CheckState): number {
  if (state.phase === 'waiting') return state.jobState === 'queued' ? 1 : 2;
  return 0;
}

export function CheckPage() {
  const { state, submit, open, reset, cancel, remove } = useCheck();
  const [text, setText] = useState('');
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<CheckRequest | null>(null);
  // Confirmations for the always-mounted status region (progress is derived from state).
  const [confirmation, setConfirmation] = useState('');
  const [focusTick, setFocusTick] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  const busy = state.phase === 'submitting' || state.phase === 'waiting';
  const settled = state.phase === 'done' || state.phase === 'failed';

  // Focus the textarea after the render that re-enables it (cancel, delete, new check).
  const focusInput = () => setFocusTick((t) => t + 1);
  useEffect(() => {
    if (focusTick > 0) textareaRef.current?.focus();
  }, [focusTick]);

  const announcement = busy ? `${STEPS[currentStep(state)]}…` : confirmation;

  // A shared link (?check=…) opens that check's result.
  useEffect(() => {
    const checkId = readCheckParam();
    if (checkId) void open(checkId);
  }, [open]);

  // When the answer arrives, move focus (and the view) to it.
  useEffect(() => {
    if (!settled) return;
    const el = resultRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }, [settled]);

  // Free the preview's object URL when the image changes or the page goes away.
  useEffect(() => {
    if (!image) return undefined;
    return () => URL.revokeObjectURL(image.previewUrl);
  }, [image]);

  const attach = async (file: File) => {
    try {
      setImage(await readImage(file));
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Nie udało się odczytać pliku.');
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // Office apps put text and an image rendering of it on the clipboard: prefer the text.
    if (e.clipboardData.getData('text/plain')) return;
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void attach(file);
  };

  const run = (request: CheckRequest) => {
    setLastRequest(request);
    setConfirmation('');
    void submit(request);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = CheckRequest.safeParse({
      text: text.trim() || undefined,
      image: image?.input,
    });
    if (!parsed.success) {
      setFormError('Wpisz lub wklej wiadomość albo dodaj zdjęcie.');
      textareaRef.current?.focus();
      return;
    }
    setFormError(null);
    run(parsed.data);
  };

  const newCheck = () => {
    reset();
    setText('');
    setImage(null);
    setFormError(null);
    window.scrollTo({ top: 0 });
    focusInput();
  };

  const edit = () => {
    reset();
    focusInput();
  };

  const cancelCheck = () => {
    cancel();
    setConfirmation('Anulowaliśmy sprawdzanie.');
    focusInput();
  };

  const removeCheck = async () => {
    const ok = await remove();
    if (ok) {
      setConfirmation('Usunęliśmy zapis sprawdzenia.');
      focusInput();
    }
    return ok;
  };

  // After a failure, resume polling a check that exists; otherwise send the message again.
  const failedCheckId = state.phase === 'failed' ? state.checkId : undefined;
  const retryFailed = failedCheckId
    ? () => void open(failedCheckId)
    : lastRequest
      ? () => run(lastRequest)
      : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-display">
            Brzmi podejrzanie? Sprawdź, zanim uwierzysz.
          </h1>
          <p className="m-0 text-body-lg text-ink-muted">Dostaniesz jasną odpowiedź i dowody.</p>
        </div>

        <form
          noValidate
          onSubmit={onSubmit}
          aria-busy={busy}
          className="flex flex-col gap-6 rounded-sm bg-surface-alt p-4 sm:p-6"
        >
          <Field
            id="claim"
            label="Wklej wiadomość lub link, albo dodaj zdjęcie"
            error={formError}
          >
            <Textarea
              ref={textareaRef}
              id="claim"
              value={text}
              maxLength={MAX_TEXT_LENGTH}
              disabled={busy}
              placeholder="Np. „Od grudnia wraca obowiązkowy pobór do wojska”"
              aria-invalid={formError ? true : undefined}
              aria-describedby={describedBy('claim', { error: Boolean(formError) })}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {image ? (
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={image.previewUrl}
                  alt=""
                  className="size-16 shrink-0 rounded-sm border border-line object-cover"
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{image.name}</span>
                  <span className="text-caption text-ink-muted">Dołączone zdjęcie</span>
                </div>
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  disabled={busy}
                  onClick={() => setImage(null)}
                >
                  <X strokeWidth={ICON_STROKE} aria-hidden="true" />
                  Usuń zdjęcie
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <Button
                  type="button"
                  variant="tool"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus strokeWidth={ICON_STROKE} aria-hidden="true" />
                  Dodaj zdjęcie lub zrzut ekranu
                </Button>
                <span className="text-caption text-ink-muted">
                  Gazeta, plakat, ekran telefonu. Odczytamy tekst za Ciebie.
                </span>
              </div>
            )}
            <span className="text-caption text-ink-muted" aria-live="off">
              {text.length} / {MAX_TEXT_LENGTH} znaków
            </span>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void attach(file);
              }}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
              {busy ? (
                <LoaderCircle
                  strokeWidth={ICON_STROKE}
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {busy ? 'Sprawdzamy…' : 'Sprawdź'}
            </Button>
            <p className="m-0 text-caption text-ink-muted">
              Bezpłatnie i bez logowania. Dane osobowe usuwamy z wiadomości przed sprawdzeniem.{' '}
              <a className="pw-link" href="#jak-dzialamy">
                Jak to działa
              </a>
            </p>
          </div>
        </form>

        {busy ? (
          <section
            aria-labelledby="progress-title"
            className="flex flex-col gap-4 border-t border-line-soft pt-8"
          >
            <h2 id="progress-title" className="m-0 text-title-2">
              Sprawdzamy – to potrwa do 30 sekund
            </h2>
            <Steps label="Postęp sprawdzania" steps={STEPS} current={currentStep(state)} />
            <Button variant="text" className="self-start" onClick={cancelCheck}>
              Anuluj sprawdzanie
            </Button>
          </section>
        ) : null}

        {settled ? (
          <section
            ref={resultRef}
            tabIndex={-1}
            aria-label="Wynik sprawdzenia"
            className="scroll-mt-6 outline-none"
          >
            {state.phase === 'done' ? (
              <CheckResult
                checkId={state.checkId}
                result={state.result}
                onNewCheck={newCheck}
                onRetry={lastRequest ? () => run(lastRequest) : undefined}
                onEdit={edit}
                onRemove={removeCheck}
              />
            ) : null}
            {state.phase === 'failed' ? (
              <div className="flex flex-col gap-6">
                <Notice title={state.title}>
                  <p>{state.message}</p>
                  {state.canRetry && retryFailed ? (
                    <Button
                      variant="secondary"
                      className="justify-self-start"
                      onClick={retryFailed}
                    >
                      Spróbuj ponownie
                    </Button>
                  ) : null}
                </Notice>
                <Button variant="text" className="self-start" onClick={newCheck}>
                  Zacznij od nowa
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section
          id="jak-dzialamy"
          aria-labelledby="how-title"
          className="flex scroll-mt-6 flex-col gap-4 border-t border-line-soft pt-8"
        >
          <h2 id="how-title" className="m-0 text-title-2">
            Jak to działa
          </h2>
          <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-body">
            <li>
              <strong>Rozkładamy wiadomość na części.</strong> Każde twierdzenie sprawdzamy osobno.
            </li>
            <li>
              <strong>Szukamy w oficjalnych źródłach.</strong> Komunikaty rządu i ministerstw,
              ostrzeżenia służb i informacje MSZ dla podróżujących.
            </li>
            <li>
              <strong>Pokazujemy dowody.</strong> Każde źródło możesz otworzyć i przeczytać.
            </li>
          </ol>
          <p className="m-0 text-body">
            <strong>Nie zgadujemy.</strong> Gdy dowodów jest za mało, mówimy to wprost, zamiast
            oceniać na siłę.
          </p>
          <div className="flex flex-col gap-1">
            <Eyebrow>Gdzie szukamy</Eyebrow>
            <p className="m-0 text-caption text-ink-muted">{SOURCES_LINE}</p>
          </div>
        </section>
      </main>

      <output className="sr-only" aria-live="polite">
        {announcement}
      </output>

      <SiteFooter />
    </div>
  );
}
