import { AppSettings, LLMProvider } from './types';

/** Checked against each provider's own list on 2026-11-05. Model names expire, so people can type any other name in AI Settings. */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openrouter: 'openrouter/free', // lets OpenRouter pick a free model, because single free models come and go
  gemini: 'gemini-3.8-flash',
  claude: 'claude-sonnet-5-5',
  openai: 'gpt-6-luna',
  ollama: 'llama3'
};

export const MODEL_SUGGESTIONS: Record<LLMProvider, string[]> = {
  openrouter: ['openrouter/free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-super-vl:free', 'recursive/flint-v1.0:free'],
  gemini: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'],
  claude: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
  openai: ['gpt-6-luna', 'gpt-6.1-sol'],
  ollama: ['llama3']
};

/** Ollama needs no key, so it counts as configured only when chosen as the default. */
export function isProviderConfigured(settings: AppSettings, provider: LLMProvider): boolean {
  if (provider === 'ollama') return settings.activeDefaultProvider === 'ollama';
  if (provider === 'openai' && settings.providers.openai.baseUrl) return true;
  return !!settings.providers[provider].apiKey;
}

/** Old defaults the services no longer offer. A saved one of these moves to the current default. */
export const RETIRED_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'deepseek/deepseek-r1:free',
  'mistralai/mistral-7b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'gemini-2.5-flash',
  'claude-3-7-sonnet-20250219'
];
