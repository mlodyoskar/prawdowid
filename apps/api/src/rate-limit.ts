import { createHash } from 'node:crypto';

/**
 * Prosty limiter w pamięci: stałe okno czasowe per klucz (np. IP).
 * Wystarcza dla jednej instancji API. Przy wielu instancjach trzeba wspólnego magazynu (np. Redis).
 */
export class FixedWindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #hits = new Map<string, { count: number; resetAt: number }>();
  #lastSweep = 0;

  constructor(options: { limit: number; windowMs?: number; now?: () => number }) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs ?? 60_000;
    this.#now = options.now ?? Date.now;
  }

  /** Rejestruje żądanie. `allowed: false` oznacza przekroczenie limitu. */
  hit(key: string): { allowed: true } | { allowed: false; retryAfterSec: number } {
    const now = this.#now();
    this.#sweep(now);
    const entry = this.#hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.#hits.set(key, { count: 1, resetAt: now + this.#windowMs });
      return { allowed: true };
    }
    if (entry.count >= this.#limit) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    entry.count++;
    return { allowed: true };
  }

  get size(): number {
    return this.#hits.size;
  }

  /** Usuwa wygasłe wpisy (najwyżej raz na okno), żeby mapa nie rosła bez końca. */
  #sweep(now: number): void {
    if (now - this.#lastSweep < this.#windowMs) return;
    this.#lastSweep = now;
    for (const [key, entry] of this.#hits) if (entry.resetAt <= now) this.#hits.delete(key);
  }
}

/** Skrót IP do logów: pozwala grupować zdarzenia bez zapisywania adresu. */
export function hashClientKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}
