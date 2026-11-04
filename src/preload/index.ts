import { contextBridge, ipcRenderer } from 'electron';
import { AgentRole, AppSettings, LLMProvider, MinecraftSettings, ServerTarget, Task, ViewerSettings } from '../shared/types';

export const electronAPI = {
  getState: () => ipcRenderer.invoke('get-state'),
  planGoal: (goal: string, category?: string, images?: unknown) => ipcRenderer.invoke('plan-goal', goal, category, images),
  startRun: (taskIds: string[]) => ipcRenderer.invoke('start-run', taskIds),
  setRunStopped: (runId: string, stopped: boolean) => ipcRenderer.invoke('set-run-stopped', runId, stopped),
  discardTasks: (taskIds: string[]) => ipcRenderer.invoke('discard-tasks', taskIds),
  createTask: (title: string, desc: string, category: string, agentId?: string) =>
    ipcRenderer.invoke('create-task', title, desc, category, agentId),
  updateTaskStatus: (taskId: string, status: Task['status']) =>
    ipcRenderer.invoke('update-task-status', taskId, status),
  executeTask: (taskId: string) => ipcRenderer.invoke('execute-task', taskId),
  answerDecision: (decisionId: string, approved: boolean, answer?: string) =>
    ipcRenderer.invoke('answer-decision', decisionId, approved, answer),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('save-settings', settings),
  saveMinecraftSettings: (minecraft: MinecraftSettings) => ipcRenderer.invoke('save-minecraft-settings', minecraft),
  setAgentRole: (agentId: string, role: AgentRole) => ipcRenderer.invoke('set-agent-role', agentId, role),
  setAgentProvider: (agentId: string, provider: LLMProvider | 'default') =>
    ipcRenderer.invoke('set-agent-provider', agentId, provider),
  testServer: (target: ServerTarget) => ipcRenderer.invoke('test-server', target),
  toggleBot: (agentId: string, username: string, connect: boolean) =>
    ipcRenderer.invoke('toggle-bot', agentId, username, connect),
  connectAllBots: () => ipcRenderer.invoke('connect-all-bots'),
  disconnectAllBots: () => ipcRenderer.invoke('disconnect-all-bots'),
  sendBotChat: (message: string, agentId?: string) => ipcRenderer.invoke('send-bot-chat', message, agentId),
  openMicrosoftLink: (url: string) => ipcRenderer.invoke('open-microsoft-link', url),
  watchServer: (address: string, key?: string) => ipcRenderer.invoke('watch-server', address, key),
  getViewerState: () => ipcRenderer.invoke('get-viewer-state'),
  saveViewerSettings: (viewer: ViewerSettings) => ipcRenderer.invoke('save-viewer-settings', viewer),
  rotateViewerKey: () => ipcRenderer.invoke('rotate-viewer-key'),
  inspectWorkspace: (workspace: string) => ipcRenderer.invoke('inspect-workspace', workspace),
  pickWorkspace: () => ipcRenderer.invoke('pick-workspace'),
  createProject: () => ipcRenderer.invoke('create-project'),
  enableGit: (workspace: string) => ipcRenderer.invoke('enable-git', workspace),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openReleases: () => ipcRenderer.invoke('open-releases'),
  onStateUpdate: (callback: (state: any) => void) => {
    const subscription = (_event: any, state: any) => callback(state);
    ipcRenderer.on('state-update', subscription);
    return () => ipcRenderer.removeListener('state-update', subscription);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
