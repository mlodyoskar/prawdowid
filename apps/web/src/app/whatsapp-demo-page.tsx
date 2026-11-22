import { ImagePlus, RotateCcw, SendHorizontal, X } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { AppHeader, Button, cn, Eyebrow, ICON_STROKE } from '@/ui';

import { parseWhatsApp, type Segment } from '../lib/wa-markup.ts';
import { ApiError } from './api.ts';
import { IMAGE_ACCEPT, readImage, type AttachedImage } from './image-input.ts';
import { SiteFooter } from './site-footer.tsx';
import {
  clearDemoConversation,
  newSessionId,
  readDemoReplies,
  sendDemoMessage,
} from './whatsapp-demo-api.ts';

type ChatItem = {
  key: string;
  from: 'user' | 'bot' | 'system';
  text: string;
  at: string;
  /** Picture sent by the user. The preview lives only until the page reloads. */
  image?: { name: string; previewUrl?: string };
};

type Saved = { sessionId: string; lastId: number; items: ChatItem[] };

const STORAGE_KEY = 'prawdowid-whatsapp-demo';
const POLL_MS = 1500;
/** Stop polling after this long even if the channel still shows "pisze…". */
const POLL_MAX_MS = 4 * 60_000;
const MAX_TEXT = 20_000;

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Saved>;
      if (typeof saved.sessionId === 'string' && Array.isArray(saved.items)) {
        return {
          sessionId: saved.sessionId,
          lastId: typeof saved.lastId === 'number' ? saved.lastId : 0,
          items: saved.items,
        };
      }
    }
  } catch {
    // Storage blocked or corrupt: start a fresh conversation.
  }
  return { sessionId: newSessionId(), lastId: 0, items: [] };
}

function save(state: Saved): void {
  try {
    const items = state.items.map(({ image, ...rest }) =>
      image ? { ...rest, image: { name: image.name } } : rest,
    );
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, items }));
  } catch {
    // Not critical: the conversation just will not survive a reload.
  }
}

const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

function SegmentView({ segment }: { segment: Segment }) {
  if (segment.type === 'link') {
    return (
      <a
        className="pw-link break-all"
        href={segment.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {segment.text}
      </a>
    );
  }
  if (segment.type === 'bold') return <strong>{segment.text}</strong>;
  if (segment.type === 'italic') return <em>{segment.text}</em>;
  if (segment.type === 'strike') return <s>{segment.text}</s>;
  return <>{segment.text}</>;
}

/** Message text with WhatsApp markup rendered and links clickable. */
function MessageText({ text }: { text: string }) {
  const lines = parseWhatsApp(text);
  return (
    <p className="m-0 break-words whitespace-pre-wrap">
      {lines.map((segments, i) => (
        // Lines never reorder, so the index is a stable key.
        // oxlint-disable-next-line react/no-array-index-key
        <Fragment key={i}>
          {i > 0 ? '\n' : null}
          {segments.map((s, j) => (
            // oxlint-disable-next-line react/no-array-index-key
            <SegmentView key={j} segment={s} />
          ))}
        </Fragment>
      ))}
    </p>
  );
}

function Bubble({ item }: { item: ChatItem }) {
  if (item.from === 'system') {
    return (
      <li className="mx-auto max-w-[90%] rounded-sm bg-notice-bg px-3 py-2 text-center text-caption text-ink">
        {item.text}
      </li>
    );
  }
  const mine = item.from === 'user';
  return (
    <li
      className={cn(
        'flex max-w-[88%] flex-col gap-1 rounded-lg px-3 py-2 text-body text-ink shadow-sm',
        mine ? 'self-end rounded-br-xs bg-chat-out' : 'self-start rounded-bl-xs bg-chat-in',
      )}
    >
      <span className="sr-only">{mine ? 'Ty:' : 'Prawdowid:'}</span>
      {item.image ? (
        item.image.previewUrl ? (
          <img
            src={item.image.previewUrl}
            alt={`Wysłane zdjęcie: ${item.image.name}`}
            className="max-h-60 rounded-sm object-contain"
          />
        ) : (
          <span className="text-caption text-ink-muted">Zdjęcie: {item.image.name}</span>
        )
      ) : null}
      {item.text ? <MessageText text={item.text} /> : null}
      <time dateTime={item.at} className="self-end text-[12px] leading-4 text-ink-muted">
        {timeFmt.format(new Date(item.at))}
      </time>
    </li>
  );
}

export function WhatsAppDemoPage() {
  const [initial] = useState(load);
  const [sessionId, setSessionId] = useState(initial.sessionId);
  const [items, setItems] = useState<ChatItem[]>(initial.items);
  const lastId = useRef(initial.lastId);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [sending, setSending] = useState(false);
  // Bumping this (re)starts polling for replies.
  const [pollKey, setPollKey] = useState(initial.items.length > 0 ? 1 : 0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const append = useCallback((...next: ChatItem[]) => setItems((prev) => [...prev, ...next]), []);
  const systemNote = useCallback(
    (text: string) =>
      append({
        key: `s-${crypto.randomUUID()}`,
        from: 'system',
        text,
        at: new Date().toISOString(),
      }),
    [append],
  );

  useEffect(() => save({ sessionId, lastId: lastId.current, items }), [sessionId, items]);

  // Keep the newest message (or "pisze…") in view whenever the list grows.
  const rows = items.length + (typing ? 1 : 0);
  useEffect(() => {
    const el = listRef.current;
    if (el && rows > 0) el.scrollTop = el.scrollHeight;
  }, [rows]);

  // Poll for replies after each message, until the reply came and "pisze…" went off.
  useEffect(() => {
    if (pollKey === 0) return undefined;
    const ctrl = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let received = 0;
    let failures = 0;

    const tick = async () => {
      let delay = POLL_MS;
      try {
        const { messages, typing: isTyping } = await readDemoReplies(
          sessionId,
          lastId.current,
          ctrl.signal,
        );
        failures = 0;
        polls++;
        if (messages.length > 0) {
          lastId.current = Math.max(lastId.current, ...messages.map((m) => m.id));
          received += messages.length;
          append(
            ...messages.map((m): ChatItem => ({
              key: `b-${m.id}`,
              from: 'bot',
              text: m.text,
              at: m.sentAt,
            })),
          );
        }
        setTyping(isTyping);
        if (!isTyping && (received > 0 || polls >= 3)) return;
      } catch (err) {
        if (ctrl.signal.aborted) return;
        failures++;
        if (err instanceof ApiError && err.retryAfterMs) delay = err.retryAfterMs;
        if (failures === 3) {
          systemNote(
            err instanceof ApiError
              ? err.message
              : 'Nie udało się pobrać odpowiedzi. Sprawdź połączenie z internetem.',
          );
        }
      }
      if (Date.now() - started > POLL_MAX_MS) {
        setTyping(false);
        return;
      }
      timer = setTimeout(() => void tick(), delay);
    };
    void tick();
    return () => {
      ctrl.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pollKey, sessionId, append, systemNote]);

  // Free the attachment preview if it is removed before sending.
  const dropImage = () => {
    if (image) URL.revokeObjectURL(image.previewUrl);
    setImage(null);
  };

  const attach = async (file: File) => {
    try {
      if (image) URL.revokeObjectURL(image.previewUrl);
      setImage(await readImage(file));
    } catch (err) {
      systemNote(err instanceof Error ? err.message : 'Nie udało się odczytać pliku.');
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.getData('text/plain')) return;
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void attach(file);
  };

  const sendMessage = async (text: string, picture: AttachedImage | null) => {
    if (!text && !picture) {
      inputRef.current?.focus();
      return;
    }
    append({
      key: `u-${crypto.randomUUID()}`,
      from: 'user',
      text,
      at: new Date().toISOString(),
      ...(picture ? { image: { name: picture.name, previewUrl: picture.previewUrl } } : {}),
    });
    setSending(true);
    try {
      await sendDemoMessage({
        sessionId,
        ...(text ? { text } : {}),
        ...(picture ? { image: picture.input } : {}),
      });
      setPollKey((k) => k + 1);
    } catch (err) {
      systemNote(
        err instanceof ApiError
          ? err.message
          : 'Nie udało się wysłać wiadomości. Spróbuj ponownie.',
      );
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const onSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    const picture = image;
    setDraft('');
    setImage(null);
    void sendMessage(text, picture);
  };

  // Enter sends, Shift+Enter adds a line, like in a messenger.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit();
    }
  };

  const restart = () => {
    const old = sessionId;
    void clearDemoConversation(old).catch(() => {});
    lastId.current = 0;
    setItems([]);
    setTyping(false);
    setPollKey(0);
    setSessionId(newSessionId());
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AppHeader>
        <a className="pw-link text-label" href="/">
          Sprawdź na stronie
        </a>
      </AppHeader>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <Eyebrow>Drugi kanał</Eyebrow>
          <h1 className="m-0 text-title-1 sm:text-display">
            Symulator kanału WhatsApp (adapter demonstracyjny)
          </h1>
          <p className="m-0 text-body-lg text-ink-muted">
            Ta rozmowa działa na tym samym kodzie co prawdziwy kanał WhatsApp: te same polecenia,
            limity, kolejka sprawdzeń i ten sam tekst odpowiedzi. Zmienia się tylko sposób
            przesyłania wiadomości.
          </p>
        </div>

        <section
          aria-labelledby="chat-title"
          className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-line bg-chat-bg shadow-bar"
        >
          <div className="flex items-center gap-3 bg-chat-bar px-4 py-3 text-on-chat-bar">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-chat-bar text-title-3 text-chat-bar"
            >
              P
            </span>
            <div className="flex min-w-0 flex-col">
              <h2 id="chat-title" className="m-0 text-body font-semibold">
                Prawdowid
              </h2>
              <span className="text-caption" aria-live="polite">
                {typing ? 'pisze…' : 'adapter demonstracyjny'}
              </span>
            </div>
          </div>

          <ol
            ref={listRef}
            role="log"
            aria-label="Rozmowa z Prawdowidem"
            aria-live="polite"
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be reachable by keyboard
            tabIndex={0}
            className="m-0 flex h-[min(60dvh,560px)] list-none flex-col gap-2 overflow-y-auto p-3"
          >
            {items.length === 0 ? (
              <li className="mx-auto my-auto max-w-[90%] text-center text-caption text-ink-muted">
                Wyślij tekst, link albo zrzut ekranu. Napisz POMOC, aby zobaczyć instrukcję, albo
                USUŃ, aby usunąć swoje sprawdzenia.
              </li>
            ) : null}
            {items.map((item) => (
              <Bubble key={item.key} item={item} />
            ))}
            {typing ? (
              <li className="self-start rounded-lg rounded-bl-xs bg-chat-in px-3 py-2 text-caption text-ink-muted italic shadow-sm">
                Prawdowid pisze…
              </li>
            ) : null}
          </ol>

          <form
            onSubmit={onSubmit}
            aria-busy={sending}
            className="flex flex-col gap-2 border-t border-line-soft bg-surface p-2"
          >
            {image ? (
              <div className="flex items-center gap-2 rounded-sm bg-surface-alt p-2">
                <img
                  src={image.previewUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-sm border border-line object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-caption">{image.name}</span>
                <Button type="button" variant="text" size="sm" onClick={dropImage}>
                  <X strokeWidth={ICON_STROKE} aria-hidden="true" />
                  Usuń zdjęcie
                </Button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="tool"
                size="icon"
                aria-label="Dodaj zdjęcie lub zrzut ekranu"
                title="Dodaj zdjęcie lub zrzut ekranu"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus strokeWidth={ICON_STROKE} aria-hidden="true" />
              </Button>
              <label htmlFor="wa-message" className="sr-only">
                Wiadomość
              </label>
              <textarea
                ref={inputRef}
                id="wa-message"
                rows={1}
                value={draft}
                maxLength={MAX_TEXT}
                placeholder={image ? 'Podpis (opcjonalnie)' : 'Wiadomość'}
                aria-describedby="wa-hint"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                className="field-sizing-content block max-h-40 min-h-touch w-full flex-1 resize-none rounded-lg border border-line-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-muted"
              />
              <Button type="submit" size="icon" aria-label="Wyślij" title="Wyślij">
                <SendHorizontal strokeWidth={ICON_STROKE} aria-hidden="true" />
              </Button>
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
            <p id="wa-hint" className="m-0 px-1 text-caption text-ink-muted">
              Enter wysyła, Shift+Enter dodaje nową linię.
            </p>
          </form>
        </section>

        <div className="mx-auto flex w-full max-w-md flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="tool"
            size="sm"
            disabled={sending}
            onClick={() => void sendMessage('POMOC', null)}
          >
            Wyślij POMOC
          </Button>
          <Button
            type="button"
            variant="tool"
            size="sm"
            disabled={sending}
            onClick={() => void sendMessage('USUŃ', null)}
          >
            Wyślij USUŃ
          </Button>
          <Button type="button" variant="text" size="sm" className="ml-auto" onClick={restart}>
            <RotateCcw strokeWidth={ICON_STROKE} aria-hidden="true" />
            Nowa rozmowa
          </Button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
