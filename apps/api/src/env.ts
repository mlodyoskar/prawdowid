import { resolve } from 'node:path';

import { ResearchMode } from '@prawdowid/contracts';
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
  /**
   * Tryb kroku wyszukiwania (docs/agent.md): `agent` = pętla modelu z narzędziami,
   * `plan` = plan zapytań wykonywany przez kod + sędzia bez narzędzi.
   */
  RESEARCH_MODE: z.preprocess(emptyToUndefined, ResearchMode.default('agent')),
  /** Osobny model sędziego w trybie `plan` (format jak LLM_MODEL). Domyślnie LLM_MODEL. */
  LLM_JUDGE_MODEL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[\w-]+:.+$/, 'Format: <dostawca>:<model>')
      .optional(),
  ),
  /**
   * Temperatura w trybie `plan`. Domyślnie 0: mniejszy rozrzut między powtórzeniami tego samego zgłoszenia.
   * `none` = parametr nie jest wysyłany (część modeli go nie przyjmuje).
   */
  LLM_TEMPERATURE: z
    .preprocess(
      emptyToUndefined,
      z.union([z.literal('none'), z.coerce.number().min(0).max(2)]).default(0),
    )
    .transform((v) => (v === 'none' ? undefined : v)),
  /**
   * Cena modelu w USD za milion tokenów (wejście/wyjście), do zapisu kosztu sprawdzenia.
   * Puste = koszt nie jest liczony, zostają same tokeny.
   */
  LLM_PRICE_INPUT_PER_MTOK: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  LLM_PRICE_OUTPUT_PER_MTOK: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  /**
   * true = serwer nie startuje bez skonfigurowanego modelu. Na produkcji wdrożenie bez LLM
   * nie przechodzi wtedy healthchecku, a platforma zostawia poprzednią wersję.
   */
  REQUIRE_LLM: boolFlag(false),
  GOOGLE_FACTCHECK_API_KEY: optionalString,
  CORPUS_DB_PATH: z.preprocess(emptyToUndefined, z.string().default('data/corpus.db')),
  CHECKS_DB_PATH: z.preprocess(emptyToUndefined, z.string().default('data/checks.db')),
  MAX_CONCURRENT_CHECKS: int(4),
  MAX_QUEUED_CHECKS: int(50),
  /** Wymóg zadania: mediana od wejścia do odpowiedzi ≤ 30 s (tekst/URL). */
  CHECK_TIMEOUT_MS: int(30_000),
  CHECKS_RETENTION_HOURS: int(72),
  /**
   * Przez tyle godzin to samo zgłoszenie (po normalizacji, w każdym kanale) dostaje kopię pełnego
   * wyniku zamiast nowego sprawdzenia: ten sam werdykt i te same dowody. 0 wyłącza. Kopia znika
   * najpóźniej z retencją (CHECKS_RETENTION_HOURS) albo po usunięciu sesji.
   */
  CHECK_REUSE_HOURS: z.preprocess(emptyToUndefined, z.coerce.number().min(0).default(24)),
  /** Limit nowych sprawdzeń na klienta (IP) na minutę. */
  RATE_LIMIT_PER_MINUTE: int(10),
  /** Limit odpytań o wynik na klienta na minutę (polling co ~1 s mieści się z zapasem). */
  RATE_LIMIT_GET_PER_MINUTE: int(120),
  /** Czy ufać nagłówkowi X-Forwarded-For (tylko za zaufanym proxy). */
  TRUST_PROXY: boolFlag(false),
  PORT: int(3000),
  WEB_ORIGIN: z.preprocess(emptyToUndefined, z.string().default('http://localhost:5173')),
  /**
   * Kanał WhatsApp (Meta Cloud API). Włączony, gdy ustawione są cztery wartości poniżej.
   * Stały token System User z uprawnieniem whatsapp_business_messaging.
   */
  WHATSAPP_ACCESS_TOKEN: optionalString,
  /** Phone Number ID z panelu WhatsApp → API Setup (to nie jest sam numer telefonu). */
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  /** App Secret aplikacji Meta: weryfikacja podpisu webhooka. */
  WHATSAPP_APP_SECRET: optionalString,
  /** Dowolny losowy ciąg, ten sam co w konfiguracji webhooka w panelu Meta. */
  WHATSAPP_VERIFY_TOKEN: optionalString,
  WHATSAPP_GRAPH_VERSION: z.preprocess(emptyToUndefined, z.string().default('v23.0')),
  /** Limit nowych wiadomości na jeden numer na minutę. */
  WHATSAPP_RATE_LIMIT_PER_MINUTE: int(5),
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
