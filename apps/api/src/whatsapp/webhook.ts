import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  CheckRequest,
  MAX_TEXT_LENGTH,
  type CheckJob,
  type CheckResponse,
} from '@prawdowid/contracts';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { FixedWindowLimiter, hashClientKey } from '../rate-limit.ts';
import { formatReply } from './format.ts';
import type { GraphClient } from './graph.ts';

type Level = 'info' | 'warn' | 'error';
export type ChannelLog = (event: string, data?: Record<string, unknown>, level?: Level) => void;

export type WhatsAppChannelDeps = {
  graph: Pick<GraphClient, 'sendText' | 'downloadImage' | 'markReadTyping'>;
  runner: { enqueue(input: CheckRequest): CheckJob | null; delete(id: string): boolean };
  appSecret: string;
  verifyToken: string;
  /** Adres frontendu: link do pełnego wyniku w WWW. */
  webOrigin: string;
  llmConfigured: boolean;
  ratePerMinute: number;
  log: ChannelLog;
  now?: () => number;
  /**
   * Co ile ponawiać „pisze…” w trakcie sprawdzenia (Meta gasi wskaźnik po 25 s).
   * 0 wyłącza ponawianie.
   */
  typingRefreshMs?: number;
};

/** Teksty dla użytkownika. Żaden nie jest werdyktem. */
export const MESSAGES = {
  help:
    'Prawdowid pomaga sprawdzić informację.\n\n' +
    'Wyślij tekst, link albo zrzut ekranu. Odpowiem werdyktem ze źródłami, zwykle w ciągu 30 sekund.\n\n' +
    'Napisz USUŃ, aby usunąć swoje sprawdzenia.\n\n' +
    'Wynik wspiera Twoją ocenę, ale jej nie zastępuje. Zawsze pokazujemy źródło.',
  unsupported:
    'Obsługuję tekst, link i zdjęcie (zrzut ekranu). Ten rodzaj wiadomości nie zostanie sprawdzony.',
  tooLong: `Wiadomość jest za długa (limit ${MAX_TEXT_LENGTH} znaków). Wyślij najważniejszy fragment.`,
  imageFailed:
    'Nie udało się pobrać zdjęcia. To nie jest werdykt. Wyślij je ponownie albo wklej tekst.',
  busy: 'Zbyt wiele zgłoszeń naraz. To nie jest werdykt. Spróbuj ponownie za chwilę.',
  notConfigured:
    'Usługa nie ma skonfigurowanego modelu językowego. To nie jest werdykt. Spróbuj później.',
  rateLimited: (sec: number) =>
    `Za dużo wiadomości w krótkim czasie. Spróbuj ponownie za ${sec} s.`,
  deleted: (n: number) =>
    n === 0
      ? 'Nie ma zapisanych sprawdzeń z tego numeru.'
      : `Usunięto zapisane sprawdzenia z tego numeru (${n}).`,
} as const;

const HELP_COMMANDS = new Set(['pomoc', 'help', 'start', 'menu', '?', 'cześć', 'czesc', 'hej']);
const DELETE_COMMANDS = new Set(['usuń', 'usun']);

/** Tylko pola, których używamy. Reszta payloadu Meta jest ignorowana. */
const Message = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
});
type Message = z.infer<typeof Message>;

const Payload = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({ messages: z.array(z.unknown()).optional() }).loose(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

/** Podpis Meta: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(surowe body, App Secret)>`. */
export function verifySignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Pending = {
  to: string;
  ack: Promise<unknown>;
  typing?: ReturnType<typeof setInterval> | undefined;
};

const MAX_SEEN_IDS = 2000;
const TYPING_REFRESH_MS = 20_000;
/** Ponawiamy „pisze…” najwyżej tyle razy (~3 min), gdyby sprawdzenie się zawiesiło. */
const MAX_TYPING_REFRESHES = 9;
const MAX_CHECKS_PER_SENDER = 50;

/**
 * Adapter kanału WhatsApp (Meta Cloud API). Tylko tłumaczy wiadomości na `CheckRequest`
 * i wyniki na tekst: weryfikację robi ten sam `JobRunner` → `runVerification()` co dla WWW.
 *
 * Numer telefonu żyje wyłącznie w pamięci procesu (do odesłania odpowiedzi i obsługi USUŃ);
 * nie trafia do bazy ani do logów (tam tylko skrót).
 */
export class WhatsAppChannel {
  readonly #deps: WhatsAppChannelDeps;
  readonly #limiter: FixedWindowLimiter;
  readonly #seen = new Set<string>();
  /**
   * checkId → nadawca, obietnica oznaczenia „przeczytano, pisze…” (odpowiedź idzie dopiero
   * po niej, żeby wskaźnik nie pojawił się po odpowiedzi) i timer ponawiania wskaźnika.
   */
  readonly #pending = new Map<string, Pending>();
  readonly #bySender = new Map<string, string[]>();
  readonly #inflight = new Set<Promise<unknown>>();

  constructor(deps: WhatsAppChannelDeps) {
    this.#deps = deps;
    this.#limiter = new FixedWindowLimiter({
      limit: deps.ratePerMinute,
      ...(deps.now ? { now: deps.now } : {}),
    });
  }

  /** Trasy montowane pod `/webhooks/whatsapp`. */
  routes(): Hono {
    const r = new Hono();

    // Weryfikacja subskrypcji przy konfiguracji webhooka w panelu Meta.
    r.get('/', (c) => {
      const ok =
        c.req.query('hub.mode') === 'subscribe' &&
        c.req.query('hub.verify_token') === this.#deps.verifyToken;
      const challenge = c.req.query('hub.challenge');
      if (!ok || !challenge) return c.text('Forbidden', 403);
      return c.text(challenge, 200);
    });

    r.post(
      '/',
      bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.text('Payload too large', 413) }),
      async (c) => {
        const raw = await c.req.text();
        if (!verifySignature(raw, c.req.header('x-hub-signature-256'), this.#deps.appSecret)) {
          this.#deps.log('whatsapp_bad_signature', {}, 'warn');
          return c.text('Unauthorized', 401);
        }
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          return c.text('Bad Request', 400);
        }
        // Meta ponawia webhook bez szybkiego 200, więc przetwarzamy w tle.
        this.#track(this.handlePayload(json));
        return c.text('OK', 200);
      },
    );
    return r;
  }

  /** Czeka na zakończenie przetwarzania w tle (testy, zamykanie serwera). */
  async idle(): Promise<void> {
    while (this.#inflight.size > 0) await Promise.allSettled(this.#inflight);
  }

  async handlePayload(payload: unknown): Promise<void> {
    const parsed = Payload.safeParse(payload);
    if (!parsed.success) {
      this.#deps.log('whatsapp_bad_payload', {}, 'warn');
      return;
    }
    const messages = parsed.data.entry
      .flatMap((e) => e.changes)
      .flatMap((ch) => ch.value.messages ?? [])
      .flatMap((m) => {
        const msg = Message.safeParse(m);
        return msg.success ? [msg.data] : [];
      });
    for (const msg of messages) await this.#handleMessage(msg);
  }

  async #handleMessage(msg: Message): Promise<void> {
    if (this.#seen.has(msg.id)) return;
    this.#remember(msg.id);
    const sender = hashClientKey(msg.from);
    this.#deps.log('whatsapp_message_received', { sender, type: msg.type });

    const limit = this.#limiter.hit(msg.from);
    if (!limit.allowed) {
      this.#deps.log('rate_limited', { route: 'whatsapp', client: sender }, 'warn');
      await this.#send(msg.from, MESSAGES.rateLimited(limit.retryAfterSec));
      return;
    }

    let input: unknown;
    if (msg.type === 'text' && msg.text) {
      const body = msg.text.body.trim();
      const command = body.toLowerCase();
      if (body === '' || HELP_COMMANDS.has(command)) {
        await this.#send(msg.from, MESSAGES.help);
        return;
      }
      if (DELETE_COMMANDS.has(command)) {
        await this.#deleteAll(msg.from);
        return;
      }
      input = { text: body };
    } else if (msg.type === 'image' && msg.image) {
      const image = await this.#deps.graph.downloadImage(msg.image.id);
      if (!image.ok) {
        this.#deps.log('whatsapp_media_failed', { sender, error: image.error }, 'warn');
        await this.#send(msg.from, MESSAGES.imageFailed);
        return;
      }
      const caption = msg.image.caption?.trim();
      input = { image: image.value, ...(caption ? { text: caption } : {}) };
    } else {
      await this.#send(msg.from, MESSAGES.unsupported);
      return;
    }

    const request = CheckRequest.safeParse(input);
    if (!request.success) {
      await this.#send(msg.from, MESSAGES.tooLong);
      return;
    }
    if (!this.#deps.llmConfigured) {
      await this.#send(msg.from, MESSAGES.notConfigured);
      return;
    }

    const job = this.#deps.runner.enqueue(request.data);
    if (!job) {
      await this.#send(msg.from, MESSAGES.busy);
      return;
    }

    const checks = this.#bySender.get(msg.from) ?? [];
    checks.push(job.checkId);
    this.#bySender.set(msg.from, checks.slice(-MAX_CHECKS_PER_SENDER));
    // Zamiast wiadomości „Sprawdzam…”: „przeczytano” i „pisze…”. To nie jest wiadomość,
    // więc nie zużywa płatnej puli wiadomości serwisowych.
    const ack = this.#markReadTyping(msg.id, sender);
    const entry: Pending = { to: msg.from, ack };
    this.#pending.set(job.checkId, entry);
    this.#deps.log('whatsapp_check_enqueued', { sender, checkId: job.checkId });
    const refreshMs = this.#deps.typingRefreshMs ?? TYPING_REFRESH_MS;
    if ((await ack) && refreshMs > 0 && this.#pending.get(job.checkId) === entry) {
      let left = MAX_TYPING_REFRESHES;
      entry.typing = setInterval(() => {
        if (--left < 0) return this.#stopTyping(entry);
        this.#track(
          this.#markReadTyping(msg.id, sender).then((ok) => {
            if (!ok) this.#stopTyping(entry);
          }),
        );
      }, refreshMs);
      entry.typing.unref?.();
    }
  }

  /** Woła to `JobRunner.onDone`: odsyła wynik, jeśli sprawdzenie przyszło z WhatsAppa. */
  onCheckDone(checkId: string, response: CheckResponse): void {
    const pending = this.#pending.get(checkId);
    if (!pending) return;
    this.#pending.delete(checkId);
    this.#stopTyping(pending);
    this.#track(
      (async () => {
        await pending.ack;
        const sent = await this.#send(pending.to, formatReply(response, this.#deps.webOrigin));
        if (sent) {
          this.#deps.log('whatsapp_reply_sent', {
            sender: hashClientKey(pending.to),
            checkId,
            status: response.status,
          });
        }
      })(),
    );
  }

  async #deleteAll(from: string): Promise<void> {
    const ids = this.#bySender.get(from) ?? [];
    let deleted = 0;
    for (const id of ids) {
      const pending = this.#pending.get(id);
      if (pending) this.#stopTyping(pending);
      this.#pending.delete(id);
      if (this.#deps.runner.delete(id)) deleted++;
    }
    this.#bySender.delete(from);
    this.#deps.log('whatsapp_checks_deleted', { sender: hashClientKey(from), count: deleted });
    await this.#send(from, MESSAGES.deleted(deleted));
  }

  async #markReadTyping(messageId: string, sender: string): Promise<boolean> {
    const res = await this.#deps.graph.markReadTyping(messageId);
    if (!res.ok) this.#deps.log('whatsapp_typing_failed', { sender, error: res.error }, 'warn');
    return res.ok;
  }

  #stopTyping(entry: Pending): void {
    if (entry.typing !== undefined) clearInterval(entry.typing);
    entry.typing = undefined;
  }

  async #send(to: string, body: string): Promise<boolean> {
    const res = await this.#deps.graph.sendText(to, body);
    if (!res.ok) {
      this.#deps.log(
        'whatsapp_send_failed',
        { sender: hashClientKey(to), error: res.error },
        'error',
      );
    }
    return res.ok;
  }

  #remember(id: string): void {
    this.#seen.add(id);
    if (this.#seen.size > MAX_SEEN_IDS) {
      const oldest = this.#seen.values().next().value;
      if (oldest !== undefined) this.#seen.delete(oldest);
    }
  }

  #track(p: Promise<unknown>): void {
    const tracked = p.catch((err: unknown) => {
      this.#deps.log(
        'whatsapp_internal_error',
        { error: err instanceof Error ? err.message : String(err) },
        'error',
      );
    });
    this.#inflight.add(tracked);
    void tracked.finally(() => this.#inflight.delete(tracked));
  }
}
