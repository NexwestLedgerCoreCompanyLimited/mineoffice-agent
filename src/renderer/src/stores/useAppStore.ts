import { create } from 'zustand';
import {
  Agent,
  AgentRole,
  Task,
  TaskCategory,
  Decision,
  AgentLog,
  AppSettings,
  BotRuntimeState,
  LLMProvider,
  ImageAttachment,
  McpServerStatus,
  PlanMode,
  MinecraftSettings,
  PublicEventKind,
  ServerTarget,
  ServerTestResult,
  VoyagerSkill
} from '@shared/types';
import { createDefaultMinecraftSettings } from '@shared/minecraft';
import { DEFAULT_MODELS } from '@shared/models';
import { setLanguage as setActiveLanguage } from '@shared/i18n';

export type AppPage = 'home' | 'tasks' | 'review' | 'team' | 'server' | 'watch' | 'settings';

export interface FeedEvent {
  time: string;
  agentId?: string;
  kind: PublicEventKind;
  detail?: string;
}

interface AppState {
  ready: boolean;
  agents: Agent[];
  tasks: Task[];
  decisions: Decision[];
  logs: Record<string, AgentLog[]>;
  skills: VoyagerSkill[];
  minecraftBots: BotRuntimeState[];
  events: FeedEvent[];
  mcpStatuses: McpServerStatus[];
  selectedAgentId: string;
  reviewDecisionId: string | null;
  page: AppPage;
  settings: AppSettings;

  // Actions
  setPage: (page: AppPage) => void;
  openAgent: (agentId: string) => void;
  openReview: (decisionId: string) => void;

  // Async API dispatchers
  loadInitialState: () => Promise<void>;
  planGoal: (goal: string, category: PlanMode, images?: ImageAttachment[]) => Promise<{ tasks: Task[]; error?: string }>;
  startRun: (taskIds: string[]) => Promise<string | undefined>;
  setRunStopped: (runId: string, stopped: boolean) => Promise<void>;
  discardTasks: (taskIds: string[]) => Promise<void>;
  executeTask: (taskId: string) => void;
  answerDecision: (decisionId: string, approved: boolean, answer?: string) => Promise<{ ok: boolean; error?: string }>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  changeLanguage: (code: string) => void;
  saveMinecraft: (minecraft: MinecraftSettings) => void;
  setAgentRole: (agentId: string, role: AgentRole) => Promise<string | null>;
  setAgentProvider: (agentId: string, provider: LLMProvider | 'default') => Promise<void>;
  testServer: (target: ServerTarget) => Promise<ServerTestResult>;
  toggleBot: (agentId: string, username: string, connect: boolean) => Promise<void>;
  connectAllBots: () => Promise<void>;
  disconnectAllBots: () => Promise<void>;
  sendBotChat: (message: string, agentId?: string) => Promise<number>;
  openMicrosoftLink: (url: string) => void;
}

declare global {
  interface Window {
    electronAPI?: any;
  }
}

const applyState = (data: any) => ({
  agents: data.agents || [],
  tasks: data.tasks || [],
  decisions: data.decisions || [],
  logs: data.logs || {},
  minecraftBots: data.minecraftBots || [],
  skills: data.skills || [],
  events: data.events || [],
  mcpStatuses: data.mcpStatuses || []
});

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  agents: [],
  tasks: [],
  decisions: [],
  logs: {},
  skills: [],
  minecraftBots: [],
  events: [],
  mcpStatuses: [],
  selectedAgentId: 'wren',
  reviewDecisionId: null,
  page: 'home',
  settings: {
    providers: {
      openrouter: { apiKey: '', model: DEFAULT_MODELS.openrouter },
      gemini: { apiKey: '', model: DEFAULT_MODELS.gemini },
      claude: { apiKey: '', model: DEFAULT_MODELS.claude },
      openai: { apiKey: '', model: DEFAULT_MODELS.openai },
      ollama: { baseUrl: 'http://localhost:11434', model: DEFAULT_MODELS.ollama }
    },
    activeDefaultProvider: 'openrouter',
    workspacePath: '',
    soundEnabled: true,
    minecraft: createDefaultMinecraftSettings(),
    agentRoles: {},
    agentProviders: {},
    mcpServers: {},
    language: 'en',
    setupCompleted: false,
    viewer: {
      enabled: false,
      bind: '0.0.0.0',
      port: 8787,
      requireKey: true,
      key: '',
      showCoordinates: false,
      title: 'MineOffice'
    }
  },

  setPage: (page) => set({ page }),
  openAgent: (agentId) => set({ selectedAgentId: agentId, page: 'team' }),
  openReview: (decisionId) => set({ reviewDecisionId: decisionId, page: 'review' }),

  loadInitialState: async () => {
    if (window.electronAPI) {
      const data = await window.electronAPI.getState();
      if (data) {
        // Before the state lands, so the first screen is already in the right language
        if (data.settings) setActiveLanguage(data.settings.language);
        set({ ...applyState(data), settings: data.settings || get().settings, ready: true });
      }

      window.electronAPI.onStateUpdate((updated: any) => set(applyState(updated)));
    }
  },

  planGoal: async (goal, category, images) => {
    if (!window.electronAPI) return { tasks: [] };
    return window.electronAPI.planGoal(goal, category, images);
  },

  startRun: async (taskIds) => window.electronAPI?.startRun(taskIds),

  setRunStopped: async (runId, stopped) => {
    await window.electronAPI?.setRunStopped(runId, stopped);
  },

  discardTasks: async (taskIds) => {
    await window.electronAPI?.discardTasks(taskIds);
  },

  executeTask: (taskId) => {
    window.electronAPI?.executeTask(taskId);
  },

  answerDecision: async (decisionId, approved, answer) => {
    if (!window.electronAPI) return { ok: false, error: 'Desktop bridge is not available.' };
    return window.electronAPI.answerDecision(decisionId, approved, answer);
  },

  saveSettings: async (settings) => {
    await window.electronAPI?.saveSettings(settings);
    set({ settings });
  },

  changeLanguage: (code) => {
    setActiveLanguage(code);
    get().saveSettings({ ...get().settings, language: code });
  },

  saveMinecraft: (minecraft) => {
    set({ settings: { ...get().settings, minecraft } });
    window.electronAPI?.saveMinecraftSettings(minecraft);
  },

  setAgentRole: async (agentId, role) => {
    if (!window.electronAPI) return null;
    const result = await window.electronAPI.setAgentRole(agentId, role);
    return result.ok ? null : result.error;
  },

  setAgentProvider: async (agentId, provider) => {
    await window.electronAPI?.setAgentProvider(agentId, provider);
    const { settings } = get();
    set({ settings: { ...settings, agentProviders: { ...settings.agentProviders, [agentId]: provider } } });
  },

  testServer: async (target) => {
    if (!window.electronAPI) return { ok: false, error: 'Desktop bridge is not available.' };
    return window.electronAPI.testServer(target);
  },

  toggleBot: async (agentId, username, connect) => {
    await window.electronAPI?.toggleBot(agentId, username, connect);
  },

  connectAllBots: async () => {
    await window.electronAPI?.connectAllBots();
  },

  disconnectAllBots: async () => {
    await window.electronAPI?.disconnectAllBots();
  },

  sendBotChat: async (message, agentId) => {
    return (await window.electronAPI?.sendBotChat(message, agentId)) ?? 0;
  },

  openMicrosoftLink: (url) => {
    window.electronAPI?.openMicrosoftLink(url);
  }
}));
