import { randomUUID } from 'node:crypto';

import { ImageInput } from '@prawdowid/contracts';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { hashClientKey } from '../rate-limit.ts';
import { WHATSAPP_TEXT_LIMIT, type GraphResult } from './graph.ts';
import type { ChannelLog, ChannelTransport, WhatsAppChannel } from './webhook.ts';

/**
 * Adapter demonstracyjny kanału WhatsApp: symulator rozmowy w WWW dla osób, które nie mogą
 * napisać do numeru testowego Meta (limit 5 odbiorców).
 *
 * Wiadomość z przeglądarki jest zamieniana na wiadomość w kształcie webhooka Meta i trafia do
 * `WhatsAppChannel.handlePayload()`, czyli tej samej logiki co prawdziwy webhook (polecenia,
 * limity, komunikaty, `formatReply`). Różni się tylko transport: zamiast Graph API odpowiedzi
 * trafiają do skrzynki w pamięci, którą przeglądarka odpytuje.
 *
 * `sessionId` to losowy identyfikator z przeglądarki zamiast numeru telefonu. W logach jest
 * tylko jego skrót, jak numer w prawdziwym kanale.
 */

export type DemoOutboundMessage = { id: number; text: string; sentAt: string };

type Session = {
  seq: number;
  messages: DemoOutboundMessage[];
  /** Do kiedy pokazywać „pisze…” (jak w Meta: gaśnie po 25 s albo po odpowiedzi). */
  typingUntil: number;
  touchedAt: number;
};

export type DemoTransportOptions = {
  /** Najwyżej tyle rozmów w pamięci; najdawniej używana wypada pierwsza. */
  maxSessions?: number;
  /** Najwyżej tyle odpowiedzi na rozmowę (starsze wypadają). */
  maxMessages?: number;
  /** Rozmowa bez aktywności dłużej niż tyle znika. */
  sessionTtlMs?: number;
  typingMs?: number;
  now?: () => number;
};

const TYPING_MS = 25_000;
const MAX_MEDIA = 20;

/** Skrzynka odpowiedzi w pamięci zamiast Graph API. Ograniczona liczbą rozmów, wiadomości i czasem. */
export class DemoTransport implements ChannelTransport {
  readonly #sessions = new Map<string, Session>();
  /** Obrazy z bieżących żądań, odbierane przez kanał jak media z Meta (`downloadImage`). */
  readonly #media = new Map<string, unknown>();
  readonly #opts: Required<Omit<DemoTransportOptions, 'now'>>;
  readonly #now: () => number;

  constructor(opts: DemoTransportOptions = {}) {
    this.#opts = {
      maxSessions: opts.maxSessions ?? 500,
      maxMessages: opts.maxMessages ?? 30,
      sessionTtlMs: opts.sessionTtlMs ?? 3600_000,
      typingMs: opts.typingMs ?? TYPING_MS,
    };
    this.#now = opts.now ?? Date.now;
  }

  async sendText(to: string, body: string): Promise<GraphResult<void>> {
    const s = this.#session(to);
    s.messages.push({
      id: ++s.seq,
      text: body.slice(0, WHATSAPP_TEXT_LIMIT),
      sentAt: new Date(this.#now()).toISOString(),
    });
    if (s.messages.length > this.#opts.maxMessages) {
      s.messages.splice(0, s.messages.length - this.#opts.maxMessages);
    }
    s.typingUntil = 0;
    return { ok: true, value: undefined };
  }

  async markReadTyping(_messageId: string, to: string): Promise<GraphResult<void>> {
    this.#session(to).typingUntil = this.#now() + this.#opts.typingMs;
    return { ok: true, value: undefined };
  }

  /** Te same reguły co obraz z Graph API: zły typ albo rozmiar → błąd, kanał odpisze „To nie jest werdykt”. */
  async downloadImage(mediaId: string): Promise<GraphResult<ImageInput>> {
    const raw = this.#media.get(mediaId);
    this.#media.delete(mediaId);
    if (raw === undefined) return { ok: false, error: 'media_not_found' };
    const parsed = ImageInput.safeParse(raw);
    if (!parsed.success) {
      const typeOk = ImageInput.shape.mediaType.safeParse(
        typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'mediaType') : undefined,
      ).success;
      return { ok: false, error: typeOk ? 'bad_media' : 'unsupported_media_type' };
    }
    return { ok: true, value: parsed.data };
  }

  putMedia(raw: unknown): string {
    const id = `demo-media-${randomUUID()}`;
    this.#media.set(id, raw);
    while (this.#media.size > MAX_MEDIA) {
      const oldest = this.#media.keys().next().value;
      if (oldest === undefined) break;
      this.#media.delete(oldest);
    }
    return id;
  }

  dropMedia(id: string): void {
    this.#media.delete(id);
  }

  /** Odpowiedzi o numerze większym niż `after` i stan „pisze…”. */
  read(sessionId: string, after: number): { messages: DemoOutboundMessage[]; typing: boolean } {
    this.#sweep();
    const s = this.#sessions.get(sessionId);
    if (!s) return { messages: [], typing: false };
    s.touchedAt = this.#now();
    return {
      messages: s.messages.filter((m) => m.id > after),
      typing: s.typingUntil > this.#now(),
    };
  }

  clear(sessionId: string): boolean {
    return this.#sessions.delete(sessionId);
  }

  get size(): number {
    return this.#sessions.size;
  }

  #session(id: string): Session {
    this.#sweep();
    const now = this.#now();
    let s = this.#sessions.get(id);
    if (s) {
      this.#sessions.delete(id); // na koniec kolejki: najdawniej używana wypada pierwsza
    } else {
      s = { seq: 0, messages: [], typingUntil: 0, touchedAt: now };
    }
    s.touchedAt = now;
    this.#sessions.set(id, s);
    while (this.#sessions.size > this.#opts.maxSessions) {
      const oldest = this.#sessions.keys().next().value;
      if (oldest === undefined) break;
      this.#sessions.delete(oldest);
    }
    return s;
  }

  #sweep(): void {
    const cutoff = this.#now() - this.#opts.sessionTtlMs;
    for (const [id, s] of this.#sessions) if (s.touchedAt < cutoff) this.#sessions.delete(id);
  }
}

/** Losowy identyfikator z przeglądarki (np. UUID). Nigdy numer telefonu. */
export const DemoSessionId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/**
 * Pola przyjmowane jak z komunikatora: treść i obraz sprawdza dopiero kanał, żeby za długi tekst
 * albo zły obraz dał tę samą odpowiedź co w WhatsApp, a nie błąd HTTP.
 */
const DemoMessage = z
  .object({
    sessionId: DemoSessionId,
    text: z.string().max(20_000).optional(),
    image: z
      .object({ mediaType: z.string().max(100), data: z.string().max(8 * 1024 * 1024) })
      .optional(),
  })
  .refine((m) => m.text !== undefined || m.image !== undefined, {
    message: 'Podaj tekst albo zdjęcie.',
  });

const DemoQuery = z.object({
  sessionId: DemoSessionId,
  after: z.coerce.number().int().min(0).default(0),
});

const BODY_LIMIT_BYTES = 8 * 1024 * 1024;

const invalid = { error: 'invalid_request', message: 'Nieprawidłowe zgłoszenie.' } as const;

/** Trasy symulatora montowane pod `/api/demo/whatsapp`. */
export function demoRoutes(
  channel: WhatsAppChannel,
  transport: DemoTransport,
  opts: { log: ChannelLog },
): Hono {
  const r = new Hono();

  r.post(
    '/messages',
    bodyLimit({
      maxSize: BODY_LIMIT_BYTES,
      onError: (c) =>
        c.json(
          { error: 'payload_too_large', message: 'Wiadomość jest za duża (limit 8 MB).' },
          413,
        ),
    }),
    async (c) => {
      const parsed = DemoMessage.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json(invalid, 400);
      const { sessionId, text, image } = parsed.data;

      const id = `demo-${randomUUID()}`;
      const mediaId = image ? transport.putMedia(image) : undefined;
      const message = mediaId
        ? {
            from: sessionId,
            id,
            type: 'image',
            image: { id: mediaId, ...(text === undefined ? {} : { caption: text }) },
          }
        : { from: sessionId, id, type: 'text', text: { body: text ?? '' } };
      try {
        // Ten sam payload co z webhooka Meta. Czekamy na przetworzenie: natychmiastowe odpowiedzi
        // (polecenia, błędy) są w skrzynce, zanim przeglądarka zacznie ją odpytywać.
        await channel.handlePayload({ entry: [{ changes: [{ value: { messages: [message] } }] }] });
      } catch (err) {
        opts.log(
          'whatsapp_internal_error',
          {
            sender: hashClientKey(sessionId),
            error: err instanceof Error ? err.message : String(err),
          },
          'error',
        );
        return c.json(
          { error: 'internal', message: 'Nie udało się przyjąć wiadomości. Spróbuj ponownie.' },
          500,
        );
      } finally {
        if (mediaId) transport.dropMedia(mediaId);
      }
      return c.json({ accepted: true }, 202);
    },
  );

  r.get('/messages', (c) => {
    const q = DemoQuery.safeParse(c.req.query());
    if (!q.success) return c.json(invalid, 400);
    return c.json(transport.read(q.data.sessionId, q.data.after));
  });

  // Czyści skrzynkę rozmowy. Sprawdzenia usuwa polecenie USUŃ, jak w WhatsApp.
  r.delete('/messages', (c) => {
    const q = DemoSessionId.safeParse(c.req.query('sessionId'));
    if (!q.success) return c.json(invalid, 400);
    transport.clear(q.data);
    return c.body(null, 204);
  });

  return r;
}
