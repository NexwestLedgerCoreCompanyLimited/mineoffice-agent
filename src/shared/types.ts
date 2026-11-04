export type AgentRole =
  | 'commander'  // Marlow - Plans goals and delegates, never executes
  | 'coder'      // Juniper - Senior Fullstack Coder
  | 'builder'    // Wren - Minecraft Construction & Architecture Specialist
  | 'miner'      // Kit - Resource Excavation & Logistics
  | 'defender'   // Rowan - Combat & Threat Elimination (20Hz Reflexes)
  | 'explorer'   // Tove - Scouting, Mapping & Biome Discovery
  | 'product_manager'
  | 'business_analyst'
  | 'ux_designer'
  | 'ui_designer'
  | 'architect'
  | 'tech_lead'
  | 'frontend'
  | 'backend'
  | 'mobile'
  | 'data_engineer'
  | 'ml_engineer'
  | 'devops'
  | 'security'
  | 'qa'
  | 'tech_writer';

export type TaskCategory = 'code' | 'minecraft' | 'research';

/** What a goal is for. A project is many kinds of work, so its tasks each pick their own category. */
export type PlanMode = TaskCategory | 'project';

export type Department = 'command' | 'field' | 'product' | 'design' | 'engineering' | 'quality';

/** A picture sent to the AI, such as a design you like. */
export interface ImageAttachment {
  name: string;
  mimeType: string;
  base64: string;
}

export type SkillCategory = 'gathering' | 'crafting' | 'building' | 'combat' | 'movement' | 'scouting' | 'logistics' | 'survival' | 'system';

export interface RoleDefinition {
  id: AgentRole;
  label: string;
  summary: string; // Goes into AI prompts, so it stays in English
  tier: 'command' | 'field' | 'office';
  department: Department;
  readsImages: boolean; // whether pictures attached to a goal are useful to this role
  icon: string;
  inGame: boolean; // whether this role joins the Minecraft world as a bot
  taskCategories: TaskCategory[];
  skillCategories: SkillCategory[];
  prompt: string;
}

export type AgentStatus = 
  | 'idle' 
  | 'planning' 
  | 'working' 
  | 'waiting_approval' 
  | 'error' 
  | 'resting';

export type LLMProvider = 'openrouter' | 'gemini' | 'claude' | 'openai' | 'ollama';

export interface AgentLog {
  id: string;
  timestamp: string;
  level: 'info' | 'thought' | 'tool' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
}

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  role: AgentRole;
  status: AgentStatus;
  provider: LLMProvider;
  model: string;
  usesTeamDefault?: boolean; // ignore provider and model, follow the default chosen in settings
  avatarSeed: string; // for pixel avatars
  deskIndex: number;
  currentTaskId?: string;
  currentActivity?: string;
  emotions: {
    happiness: number; // 0 - 100
    confidence: number;
    stress: number;
  };
  stats: {
    tasksCompleted: number;
    codeLinesWritten: number;
    blocksMined?: number;
    blocksPlaced?: number;
  };
  health?: number; // 0 - 20 (for in-game bots)
  food?: number;   // 0 - 20
}

export type TaskStatus = 'backlog' | 'in_progress' | 'review' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedAgentId?: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dependencies: string[]; // ids of other tasks
  category: TaskCategory;
  lastError?: string; // why the last attempt failed, cleared when it is retried
  reviewFeedback?: string; // what the reviewer asked to change, used on the next attempt
  result?: string; // what this task produced, passed on to the tasks that depend on it
  goal?: string; // the goal this task is part of, so each worker can see the bigger picture
  project?: boolean; // built together on one branch, and reviewed once at the end
  runId?: string;
  checkpoint?: boolean; // you approve the result before anyone builds on it
  reworkRounds?: number;
  attempts?: number;
  worktreeBranch?: string;
  diffSummary?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type DecisionType = 'question' | 'permission' | 'merge_review' | 'approval';

export interface Decision {
  id: string;
  agentId: string;
  taskId?: string;
  type: DecisionType;
  title: string;
  prompt: string;
  options?: string[];
  diffContent?: string;
  diffTruncated?: boolean;
  autoRunFiles?: string[]; // changed files that run by themselves later, flagged for the reviewer
  toolCall?: { tool: string; args: string }; // a tool waiting for permission to run
  document?: string; // a plan or design waiting for your approval
  runId?: string; // this review covers a whole project
  commandToExecute?: string;
  worktreePath?: string;
  status: 'pending' | 'approved' | 'rejected' | 'answered';
  userAnswer?: string;
  createdAt: string;
}

export type PermissionAction = 'allow' | 'ask' | 'deny';

interface McpServerBase {
  enabled: boolean;
  permission: PermissionAction;
  timeout?: number; // milliseconds
}

/** Another program that gives agents extra tools. Either one we start, or one already running. */
export type McpServerConfig =
  | (McpServerBase & { type: 'local'; command: string[]; environment?: Record<string, string>; cwd?: string })
  | (McpServerBase & { type: 'remote'; url: string; headers?: Record<string, string> });

export interface McpServerStatus {
  name: string;
  state: 'disabled' | 'connecting' | 'connected' | 'failed';
  tools: number;
  error?: string;
}

export type ServerKind = 'local' | 'public';

// offline = no premium account (cracked servers), microsoft = real paid account
export type AuthMode = 'offline' | 'microsoft';

export interface ServerTarget {
  host: string;
  port: number;
  version: string; // 'auto' asks the server which version it runs
  postJoinCommands: string[]; // e.g. /login for AuthMe, /server survival for networks
}

export interface BotAccount {
  agentId: string;
  authMode: AuthMode;
  username: string; // in-game name when offline, account email/label when microsoft
}

export interface MinecraftSettings {
  kind: ServerKind;
  targets: Record<ServerKind, ServerTarget>;
  accounts: BotAccount[];
  commanders: string[]; // players allowed to give orders from in-game chat
  commandPrefix: string;
  autoReconnect: boolean;
  enableReflexes: boolean; // 20Hz survival reflex
  officeInWorld?: boolean; // office staff join a local world too. Off means field crew only
}

export type BotStatus = 'queued' | 'authenticating' | 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface MicrosoftAuthPrompt {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

export interface BotRuntimeState {
  agentId: string;
  username: string;
  authMode: AuthMode;
  status: BotStatus;
  connected: boolean;
  lastError?: string;
  authPrompt?: MicrosoftAuthPrompt;
  health?: number;
  food?: number;
  position?: { x: number; y: number; z: number };
  heldItem?: string;
  inventoryCount?: number;
}

export interface ServerTestResult {
  ok: boolean;
  error?: string;
  versionName?: string;
  motd?: string;
  playersOnline?: number;
  playersMax?: number;
  latencyMs?: number;
}

export interface VoyagerSkill {
  id: string;
  name: string;
  description: string;
  code: string;
  parameters: Record<string, string>;
  category: SkillCategory;
  successCount: number;
  failureCount: number;
  lastExecuted?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  isFree: boolean;
  contextLength: number;
}

export interface AppSettings {
  providers: {
    openrouter: {
      apiKey: string;
      model: string;
      availableFreeModels: string[];
    };
    gemini: {
      apiKey: string;
      model: string;
    };
    claude: {
      apiKey: string;
      model: string;
    };
    openai: {
      apiKey: string;
      model: string;
      baseUrl?: string; // any service that speaks the OpenAI API, such as LM Studio or Groq
    };
    ollama: {
      baseUrl: string;
      model: string;
    };
  };
  activeDefaultProvider: LLMProvider;
  workspacePath: string;
  soundEnabled: boolean;
  minecraft: MinecraftSettings;
  agentRoles: Record<string, AgentRole>;
  agentProviders: Record<string, LLMProvider | 'default'>;
  mcpServers: Record<string, McpServerConfig>;
  language: string;
  setupCompleted: boolean;
  viewer: ViewerSettings;
}

/** The read-only status page a server owner can share with people watching from elsewhere. */
export interface ViewerSettings {
  enabled: boolean;
  bind: string;
  port: number;
  requireKey: boolean;
  key: string;
  showCoordinates: boolean; // off by default: coordinates reveal where a base is
  title: string;
}

export interface PublicAgentStatus {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  activity?: string;
  inGame: boolean;
  online: boolean;
  health?: number;
  food?: number;
  position?: { x: number; y: number; z: number };
}

export interface PublicTaskStatus {
  id: string;
  title: string;
  status: TaskStatus;
  category: TaskCategory;
  assignee?: string;
}

export type PublicEventKind = 'bot_joined' | 'bot_left' | 'task_started' | 'task_done' | 'task_failed';

export interface PublicEvent {
  time: string;
  agent?: string;
  kind: PublicEventKind;
  detail?: string;
}

/** Why a project folder can or cannot be used for code work. */
export interface WorkspaceInfo {
  path: string;
  state: 'none' | 'missing' | 'no-git' | 'not-git' | 'no-commits' | 'detached' | 'ready';
  branch?: string;
  changedFiles?: number;
  tooBroad?: boolean;
  isApp?: boolean;
}

/**
 * Everything the status page may reveal. It is built field by field from an allowlist,
 * so settings, API keys, server addresses, account names and logs can never leak into it.
 */
export interface PublicStatus {
  title: string;
  generatedAt: string;
  botsOnline: number;
  botsTotal: number;
  agents: PublicAgentStatus[];
  tasks: PublicTaskStatus[];
  events: PublicEvent[];
}

export type WatchResult =
  | { state: 'ok'; status: PublicStatus }
  | { state: 'needs-key' }
  | { state: 'bad-key' }
  | { state: 'rate-limited' }
  | { state: 'no-viewer'; error: string; minecraft?: ServerTestResult };
