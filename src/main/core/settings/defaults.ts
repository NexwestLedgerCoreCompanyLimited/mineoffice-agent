import { AppSettings } from '@shared/types';
import { createDefaultMinecraftSettings } from '@shared/minecraft';
import { DEFAULT_MODELS } from '@shared/models';

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
        model: DEFAULT_MODELS.openrouter
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: DEFAULT_MODELS.gemini
      },
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: DEFAULT_MODELS.claude
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: DEFAULT_MODELS.openai
      },
      ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: DEFAULT_MODELS.ollama
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
