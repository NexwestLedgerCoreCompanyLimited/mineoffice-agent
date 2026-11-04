const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
  getState: () => ipcRenderer.invoke('get-state'),
  planGoal: (goal, category, images) => ipcRenderer.invoke('plan-goal', goal, category, images),
  startRun: (taskIds) => ipcRenderer.invoke('start-run', taskIds),
  setRunStopped: (runId, stopped) => ipcRenderer.invoke('set-run-stopped', runId, stopped),
  discardTasks: (taskIds) => ipcRenderer.invoke('discard-tasks', taskIds),
  createTask: (title, desc, category, agentId) =>
    ipcRenderer.invoke('create-task', title, desc, category, agentId),
  updateTaskStatus: (taskId, status) =>
    ipcRenderer.invoke('update-task-status', taskId, status),
  executeTask: (taskId) => ipcRenderer.invoke('execute-task', taskId),
  answerDecision: (decisionId, approved, answer) =>
    ipcRenderer.invoke('answer-decision', decisionId, approved, answer),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  saveMinecraftSettings: (minecraft) => ipcRenderer.invoke('save-minecraft-settings', minecraft),
  setAgentRole: (agentId, role) => ipcRenderer.invoke('set-agent-role', agentId, role),
  setAgentProvider: (agentId, provider) => ipcRenderer.invoke('set-agent-provider', agentId, provider),
  testServer: (target) => ipcRenderer.invoke('test-server', target),
  toggleBot: (agentId, username, connect) =>
    ipcRenderer.invoke('toggle-bot', agentId, username, connect),
  connectAllBots: () => ipcRenderer.invoke('connect-all-bots'),
  disconnectAllBots: () => ipcRenderer.invoke('disconnect-all-bots'),
  sendBotChat: (message, agentId) => ipcRenderer.invoke('send-bot-chat', message, agentId),
  openMicrosoftLink: (url) => ipcRenderer.invoke('open-microsoft-link', url),
  watchServer: (address, key) => ipcRenderer.invoke('watch-server', address, key),
  getViewerState: () => ipcRenderer.invoke('get-viewer-state'),
  saveViewerSettings: (viewer) => ipcRenderer.invoke('save-viewer-settings', viewer),
  rotateViewerKey: () => ipcRenderer.invoke('rotate-viewer-key'),
  inspectWorkspace: (workspace) => ipcRenderer.invoke('inspect-workspace', workspace),
  pickWorkspace: () => ipcRenderer.invoke('pick-workspace'),
  createProject: () => ipcRenderer.invoke('create-project'),
  enableGit: (workspace) => ipcRenderer.invoke('enable-git', workspace),
  onStateUpdate: (callback) => {
    const subscription = (_event, state) => callback(state);
    ipcRenderer.on('state-update', subscription);
    return () => ipcRenderer.removeListener('state-update', subscription);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
