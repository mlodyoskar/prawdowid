import { resolve } from 'node:path';

import { z } from 'zod';

const repoRoot = resolve(import.meta.dirname, '../../..');
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const boolFlag = (fallback: boolean) =>
  z
    .preprocess(emptyToUndefined, z.enum(['true', 'false', '1', '0']).optional())
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'));
const int = (fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(fallback));

const Env = z.object({
  /** Adres API zgodnego z OpenAI. Domyślnie OpenRouter; można wskazać Mistral, OpenAI, Ollama, vLLM… */
  LLM_BASE_URL: z.preprocess(emptyToUndefined, z.string().default('https://openrouter.ai/api/v1')),
  /** Klucz API OpenRouter (lub innego dostawcy wskazanego w LLM_BASE_URL). */
  OPENROUTER_API_KEY: optionalString,
  /** `<dostawca>:<model>`, np. `openai-compatible:mistral-small-latest`. */
  LLM_MODEL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[\w-]+:.+$/, 'Format: <dostawca>:<model>')
      .optional(),
  ),
  /** Czy dostawca obsługuje `response_format: json_schema`. */
  LLM_STRUCTURED_OUTPUTS: boolFlag(true),
  GOOGLE_FACTCHECK_API_KEY: optionalString,
  CORPUS_DB_PATH: z.preprocess(emptyToUndefined, z.string().default('data/corpus.db')),
  CHECKS_DB_PATH: z.preprocess(emptyToUndefined, z.string().default('data/checks.db')),
  MAX_CONCURRENT_CHECKS: int(4),
  MAX_QUEUED_CHECKS: int(50),
  /** Wymóg zadania: mediana od wejścia do odpowiedzi ≤ 30 s (tekst/URL). */
  CHECK_TIMEOUT_MS: int(30_000),
  CHECKS_RETENTION_HOURS: int(72),
  /** Limit nowych sprawdzeń na klienta (IP) na minutę. */
  RATE_LIMIT_PER_MINUTE: int(10),
  /** Limit odpytań o wynik na klienta na minutę (polling co ~1 s mieści się z zapasem). */
  RATE_LIMIT_GET_PER_MINUTE: int(120),
  /** Czy ufać nagłówkowi X-Forwarded-For (tylko za zaufanym proxy). */
  TRUST_PROXY: boolFlag(false),
  PORT: int(3000),
  WEB_ORIGIN: z.preprocess(emptyToUndefined, z.string().default('http://localhost:5173')),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = Env.parse(source);
  // Ścieżki względne liczymy od katalogu repo, niezależnie od tego, skąd uruchomiono serwer.
  return {
    ...env,
    CORPUS_DB_PATH: resolve(repoRoot, env.CORPUS_DB_PATH),
    CHECKS_DB_PATH: resolve(repoRoot, env.CHECKS_DB_PATH),
  };
}
