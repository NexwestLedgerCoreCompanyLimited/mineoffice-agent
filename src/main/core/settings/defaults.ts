import { AppSettings } from '@shared/types';
import { createDefaultMinecraftSettings } from '@shared/minecraft';

export const DEFAULT_VIEWER_PORT = 8787;

/** A key that came from the environment stays there, instead of being copied to a file on disk. */
export function stripEnvironmentKeys(settings: AppSettings): AppSettings {
  const fromEnvironment: any = createDefaultSettings('').providers;
  const providers: any = {};
  for (const [name, provider] of Object.entries<any>(settings.providers)) {
    const sameAsEnvironment = provider.apiKey && provider.apiKey === fromEnvironment[name]?.apiKey;
    providers[name] = sameAsEnvironment ? { ...provider, apiKey: '' } : provider;
  }
  return { ...settings, providers };
}

/** API keys may come from the environment, which is how a Linux service should supply them. */
export function createDefaultSettings(workspacePath: string, language = 'en'): AppSettings {
  return {
    providers: {
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        availableFreeModels: [
          'meta-llama/llama-3.3-70b-instruct:free',
          'google/gemini-2.0-flash-exp:free',
          'deepseek/deepseek-r1:free',
          'mistralai/mistral-7b-instruct:free',
          'qwen/qwen-2.5-72b-instruct:free'
        ]
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: 'gemini-2.5-flash'
      },
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-sonnet-5-5'
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4o'
      },
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: 'llama3'
      }
    },
    activeDefaultProvider: 'openrouter',
    workspacePath,
    soundEnabled: true,
    minecraft: createDefaultMinecraftSettings(),
    agentRoles: {},
    agentProviders: {},
    mcpServers: {},
    language,
    setupCompleted: false,
    viewer: {
      enabled: false,
      bind: '0.0.0.0',
      port: DEFAULT_VIEWER_PORT,
      requireKey: true,
      key: '',
      showCoordinates: false,
      title: 'MineOffice'
    }
  };
}
