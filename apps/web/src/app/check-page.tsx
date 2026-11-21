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
  'gov.pl i BIP · ISAP · EUR-Lex · dane.gov.pl · organizacje fact-checkingowe zgodne z IFCN i EFCSN · EUvsDisinfo';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  const busy = state.phase === 'submitting' || state.phase === 'waiting';
  const settled = state.phase === 'done' || state.phase === 'failed';

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
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void attach(file);
  };

  const run = (request: CheckRequest) => {
    setLastRequest(request);
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
    textareaRef.current?.focus();
  };

  const edit = () => {
    reset();
    textareaRef.current?.focus();
  };

  const hint =
    'Możesz też wkleić zrzut ekranu (Ctrl+V) albo dodać zdjęcie gazety, plakatu lub ekranu – odczytamy z niego tekst.';

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-display">Sprawdź, zanim udostępnisz</h1>
          <p className="m-0 text-body-lg text-ink-muted">
            Wklej wiadomość, link albo dodaj zdjęcie. Pokażemy, co mówią źródła urzędowe i
            zweryfikowane serwisy.
          </p>
        </div>

        <form
          noValidate
          onSubmit={onSubmit}
          aria-busy={busy}
          className="flex flex-col gap-6 rounded-sm bg-surface-alt p-4 sm:p-6"
        >
          <Field id="claim" label="Co chcesz sprawdzić?" hint={hint} error={formError}>
            <Textarea
              ref={textareaRef}
              id="claim"
              value={text}
              maxLength={MAX_TEXT_LENGTH}
              disabled={busy}
              placeholder="Np. „Od grudnia wraca obowiązkowy pobór do wojska”"
              aria-invalid={formError ? true : undefined}
              aria-describedby={describedBy('claim', { hint: true, error: Boolean(formError) })}
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
              Bezpłatnie. Nie zapisujemy Twoich danych osobowych – usuwamy je automatycznie przed
              sprawdzeniem.{' '}
              <a className="pw-link" href="#jak-dzialamy">
                Jak działamy
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
            <div aria-live="polite">
              <Steps label="Postęp sprawdzania" steps={STEPS} current={currentStep(state)} />
            </div>
            <Button variant="text" className="self-start" onClick={cancel}>
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
                onRemove={remove}
              />
            ) : null}
            {state.phase === 'failed' ? (
              <div className="flex flex-col gap-6">
                <Notice title={state.title}>
                  <p>{state.message}</p>
                  {state.canRetry && lastRequest ? (
                    <Button
                      variant="secondary"
                      className="justify-self-start"
                      onClick={() => run(lastRequest)}
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
            Jak działamy
          </h2>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-body">
            <li>
              Dzielimy wiadomość na twierdzenia i każde sprawdzamy osobno w jawnym katalogu źródeł.
            </li>
            <li>
              Werdykt podajemy tylko wtedy, gdy mamy dowody. Każdy dowód możesz otworzyć i
              przeczytać.
            </li>
            <li>
              Gdy dowodów brakuje, mówimy to wprost: „Brak wystarczających dowodów” to nie jest
              werdykt „fałsz”.
            </li>
            <li>Awaria lub przekroczony limit to nigdy ocena Twojej wiadomości.</li>
          </ul>
          <div className="flex flex-col gap-1">
            <Eyebrow>Gdzie szukamy</Eyebrow>
            <p className="m-0 text-caption text-ink-muted">{SOURCES_LINE}</p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
