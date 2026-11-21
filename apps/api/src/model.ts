import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createProviderRegistry, type LanguageModel } from 'ai';

import type { Env } from './env.ts';

/**
 * Jedyne miejsce, które zna dostawców LLM. Agent dostaje gotowy `LanguageModel`.
 * Domyślnie jeden dostawca zgodny z API OpenAI, który obsługuje OpenRouter, Mistral, OpenAI,
 * a także samodzielnie hostowane Ollama / vLLM / LM Studio. Natywnego dostawcę z AI SDK
 * (np. `@ai-sdk/anthropic`, `@ai-sdk/google`) dodaje się jedną linią w rejestrze.
 */
export function resolveModel(env: Env): LanguageModel | null {
  if (!env.LLM_MODEL || !env.LLM_BASE_URL) return null;

  const registry = createProviderRegistry({
    'openai-compatible': createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: env.LLM_BASE_URL,
      ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
      supportsStructuredOutputs: env.LLM_STRUCTURED_OUTPUTS,
      includeUsage: true,
    }),
  });

  return registry.languageModel(env.LLM_MODEL as `openai-compatible:${string}`);
}
