import { ImageInput, MAX_IMAGE_BASE64_LENGTH } from '@prawdowid/contracts';
import { z } from 'zod';

/** Limit treści jednej wiadomości tekstowej w WhatsApp. */
export const WHATSAPP_TEXT_LIMIT = 4096;

export type GraphConfig = {
  accessToken: string;
  phoneNumberId: string;
  /** Np. `v23.0`. */
  version: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type GraphResult<T> = { ok: true; value: T } | { ok: false; error: string };

const GraphError = z.object({ error: z.object({ code: z.number().optional() }) });
const MediaMeta = z.object({ url: z.url(), mime_type: z.string() });

/** Bajty obrazu mieszczące się w limicie base64 z contracts (base64 ≈ 4/3 rozmiaru). */
const MAX_IMAGE_BYTES = Math.floor((MAX_IMAGE_BASE64_LENGTH * 3) / 4);

/**
 * Minimalny klient WhatsApp Cloud API (Graph API). Nie rzuca: błąd sieci, HTTP albo
 * nieoczekiwana odpowiedź wracają jako `{ ok: false }` z opisem bez danych użytkownika.
 */
export class GraphClient {
  readonly #cfg: Required<Omit<GraphConfig, 'fetch'>>;
  readonly #fetch: typeof fetch;

  constructor(cfg: GraphConfig) {
    this.#cfg = { timeoutMs: 10_000, ...cfg };
    this.#fetch = cfg.fetch ?? fetch;
  }

  get #base(): string {
    return `https://graph.facebook.com/${this.#cfg.version}`;
  }

  async #request(url: string, init: RequestInit = {}): Promise<GraphResult<Response>> {
    try {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${this.#cfg.accessToken}`);
      const res = await this.#fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.#cfg.timeoutMs),
      });
      if (!res.ok) {
        // Kod błędu Graph API bez treści żądania: wystarcza do diagnozy (np. 190 = token wygasł).
        const body = GraphError.safeParse(await res.json().catch(() => null));
        const code = body.success ? body.data.error.code : undefined;
        return {
          ok: false,
          error: `http_${res.status}${code === undefined ? '' : `_graph_${code}`}`,
        };
      }
      return { ok: true, value: res };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network',
      };
    }
  }

  /** Wysyła wiadomość tekstową (podgląd linków włączony). */
  async sendText(to: string, body: string): Promise<GraphResult<void>> {
    const res = await this.#request(`${this.#base}/${this.#cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: body.slice(0, WHATSAPP_TEXT_LIMIT) },
      }),
    });
    return res.ok ? { ok: true, value: undefined } : res;
  }

  /** Pobiera obraz z wiadomości: najpierw adres media, potem bajty (oba z tokenem). */
  async downloadImage(mediaId: string): Promise<GraphResult<ImageInput>> {
    const meta = await this.#request(`${this.#base}/${encodeURIComponent(mediaId)}`);
    if (!meta.ok) return meta;
    const parsed = MediaMeta.safeParse(await meta.value.json().catch(() => null));
    if (!parsed.success || !parsed.data.url.startsWith('https://')) {
      return { ok: false, error: 'bad_media_meta' };
    }

    const mediaType = parsed.data.mime_type.split(';')[0]?.trim();
    const type = ImageInput.shape.mediaType.safeParse(mediaType);
    if (!type.success) return { ok: false, error: 'unsupported_media_type' };

    const file = await this.#request(parsed.data.url);
    if (!file.ok) return file;
    const bytes = Buffer.from(await file.value.arrayBuffer());
    if (bytes.length === 0) return { ok: false, error: 'empty_media' };
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: 'media_too_large' };
    return { ok: true, value: { mediaType: type.data, data: bytes.toString('base64') } };
  }
}
