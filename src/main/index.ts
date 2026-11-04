import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { SwarmOrchestrator } from './core/foreman/orchestrator';
import { ToolHost } from './core/mcp/tools';
import { ControlServer } from './core/control/controlServer';
import { SettingsStore } from './core/settings/settingsStore';
import { createDefaultSettings } from './core/settings/defaults';
import { mineofficeHome } from './core/runtime/paths';
import { ViewerServer, generateViewerKey } from './core/viewer/viewerServer';
import { buildPublicStatus } from './core/viewer/publicSnapshot';
import { watchServer } from './core/viewer/viewerClient';
import { pingServer } from './core/bot/mineflayerSwarm';
import { createNewProject, enableGit, inspectWorkspace } from './core/git/workspace';
import { t } from '@shared/i18n';
import { validateImages } from './core/agent/images';
import { installUpdate, RELEASES_URL, startUpdates, updateState } from './updater';
import { AgentRole, AppSettings, LLMProvider, MinecraftSettings, ServerTarget, ViewerSettings, ImageAttachment } from '@shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// The app's own folder is never a sensible place for an AI to write code, so it starts unset
const APP_ROOT = path.resolve(__dirname, '../..');
const defaultSettings = createDefaultSettings('');

const settingsStore = new SettingsStore(app.getPath('userData'), {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: text => safeStorage.encryptString(text),
  decrypt: data => safeStorage.decryptString(data)
});
const orchestrator = new SwarmOrchestrator(defaultSettings, path.join(app.getPath('userData'), 'minecraft-auth'));
// Someone is at the screen here, so a tool set to "ask" can wait for an answer
orchestrator.canAskForApproval = true;
const toolHost = new ToolHost(orchestrator, mineofficeHome(), () => settingsStore.save(orchestrator.settings));
const controlServer = new ControlServer(toolHost);
const viewerServer = new ViewerServer({
  getStatus: () => buildPublicStatus(orchestrator, orchestrator.settings.viewer),
  getSettings: () => orchestrator.settings.viewer,
  assetsDirectory: path.resolve(__dirname, '../../dist/assets')
});

// mineflayer throws "version not supported" from inside socket callbacks, out of reach of any
// try/catch. Without this the whole app stops with an error dialog when one bot hits such a server.
process.on('uncaughtException', err => {
  console.error('[Main] Uncaught exception:', err);
  orchestrator.swarm.handleFatalConnectionError(err);
});

// Bots on busy servers can change state many times a second; the UI only needs the latest
let stateSendTimer: NodeJS.Timeout | null = null;
function scheduleStateSend() {
  if (stateSendTimer) return;
  stateSendTimer = setTimeout(() => {
    stateSendTimer = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('state-update', getFullState());
    }
  }, 150);
}

function createWindow() {
  const preloadPath = path.resolve(__dirname, '../preload/index.cjs');
  console.log('[Main] Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: true,
    backgroundColor: '#f8f9fa',
    title: 'MineOffice Agent - Studio',
    icon: path.resolve(__dirname, '../../dist/assets/icons/logo.ico'),
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Renderer Load Error]:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });

  orchestrator.onStateUpdate = scheduleStateSend;

  const htmlPath = path.resolve(__dirname, '../../dist/index.html');
  console.log('[Main] Loading HTML file from:', htmlPath);
  mainWindow.loadFile(htmlPath).catch(err => {
    console.error('[Main] Failed to loadFile:', err);
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready to show!');
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.show();
      mainWindow.focus();
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
        }
      }, 1500);
    }
  });
}

function getFullState() {
  return {
    agents: orchestrator.getAgents(),
    tasks: orchestrator.getTasks(),
    decisions: orchestrator.getDecisions(),
    logs: orchestrator.getAllLogs(),
    minecraftBots: orchestrator.swarm.getBotStates(),
    skills: orchestrator.skills.getAllSkills(),
    events: orchestrator.getPublicEvents(),
    mcpStatuses: orchestrator.mcp.getStatuses(),
    update: updateState()
  };
}

function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(address => address && address.family === 'IPv4' && !address.internal)
    .map(address => address!.address);
}

function viewerState(error?: string) {
  return { settings: orchestrator.settings.viewer, running: viewerServer.running, addresses: lanAddresses(), error };
}

/** Starts or stops the status page to match its settings. */
async function syncViewer() {
  await viewerServer.stop();
  const viewer = orchestrator.settings.viewer;
  if (!viewer.enabled) return viewerState();

  if (viewer.requireKey && !viewer.key) {
    viewer.key = generateViewerKey();
    settingsStore.save(orchestrator.settings);
  }
  try {
    await viewerServer.start();
    return viewerState();
  } catch (err: any) {
    return viewerState(t('watch.portFailed', { port: viewer.port, error: err.message }));
  }
}

// IPC Handlers
ipcMain.handle('get-state', () => ({ ...getFullState(), settings: orchestrator.settings }));

ipcMain.handle('plan-goal', async (_event, goal: string, category: any, images?: unknown) => {
  let checked: ImageAttachment[];
  try {
    checked = validateImages(images);
  } catch (err: any) {
    return { tasks: [], error: err.message };
  }
  return orchestrator.planGoalWithDetails(goal, category, checked);
});

ipcMain.handle('start-run', async (_event, taskIds: string[]) => {
  return (await orchestrator.startRun(taskIds)).runId;
});

ipcMain.handle('set-run-stopped', (_event, runId: string, stopped: boolean) => {
  return orchestrator.setRunStopped(runId, stopped);
});

ipcMain.handle('discard-tasks', (_event, taskIds: string[]) => {
  orchestrator.discardTasks(taskIds);
  return true;
});

ipcMain.handle('create-task', (_event, title: string, desc: string, category: any, agentId?: string) => {
  return orchestrator.createTask(title, desc, category, agentId);
});

ipcMain.handle('update-task-status', (_event, taskId: string, status: any) => {
  orchestrator.updateTaskStatus(taskId, status);
  return true;
});

ipcMain.handle('execute-task', async (_event, taskId: string) => {
  return orchestrator.executeTask(taskId);
});

ipcMain.handle('answer-decision', (_event, decisionId: string, approved: boolean, answer?: string) => {
  return orchestrator.answerDecision(decisionId, approved, answer);
});

ipcMain.handle('save-settings', (_event, form: AppSettings) => {
  // Only what the settings form edits. Roles, the server and sharing are saved by their own
  // handlers, and this copy from the screen may be older than those.
  const next: AppSettings = {
    ...orchestrator.settings,
    providers: form.providers,
    activeDefaultProvider: form.activeDefaultProvider,
    workspacePath: form.workspacePath,
    soundEnabled: form.soundEnabled,
    language: form.language,
    setupCompleted: form.setupCompleted,
    mcpServers: form.mcpServers
  };
  orchestrator.applySettings(next);
  settingsStore.save(next);
  return true;
});

ipcMain.handle('save-minecraft-settings', (_event, minecraft: MinecraftSettings) => {
  orchestrator.settings.minecraft = minecraft;
  orchestrator.swarm.updateSettings(minecraft);
  settingsStore.save(orchestrator.settings);
  return true;
});

ipcMain.handle('set-agent-role', (_event, agentId: string, role: AgentRole) => {
  const result = orchestrator.setAgentRole(agentId, role);
  if (result.ok) settingsStore.save(orchestrator.settings);
  return result;
});

ipcMain.handle('set-agent-provider', (_event, agentId: string, provider: LLMProvider | 'default') => {
  const changed = orchestrator.setAgentProvider(agentId, provider);
  if (changed) settingsStore.save(orchestrator.settings);
  return changed;
});

ipcMain.handle('test-server', (_event, target: ServerTarget) => pingServer(target));

ipcMain.handle('toggle-bot', (_event, agentId: string, username: string, connect: boolean) => {
  if (connect) {
    orchestrator.swarm.spawnBot(agentId, username);
  } else {
    orchestrator.swarm.disconnectBot(agentId);
  }
  return true;
});

ipcMain.handle('connect-all-bots', () => {
  orchestrator.connectAllBots();
  return true;
});

ipcMain.handle('disconnect-all-bots', () => {
  orchestrator.swarm.disconnectAll();
  return true;
});

ipcMain.handle('send-bot-chat', (_event, message: string, agentId?: string) => {
  return orchestrator.swarm.broadcastChat(message, agentId);
});

ipcMain.handle('open-microsoft-link', (_event, url: string) => {
  // The address comes from the sign-in library; only ever open Microsoft's own device login page
  const parsed = new URL(url);
  if (parsed.protocol === 'https:' && /(^|\.)(microsoft\.com|live\.com)$/.test(parsed.hostname)) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('watch-server', (_event, address: string, key?: string) => watchServer(address, key));

ipcMain.handle('get-viewer-state', () => viewerState());

ipcMain.handle('install-update', () => installUpdate());

ipcMain.handle('open-releases', () => shell.openExternal(RELEASES_URL));

ipcMain.handle('inspect-workspace', (_event, workspace: string) => inspectWorkspace(workspace, APP_ROOT));

ipcMain.handle('pick-workspace', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('create-project', () => createNewProject());

ipcMain.handle('enable-git', (_event, workspace: string) => enableGit(workspace, APP_ROOT));

ipcMain.handle('save-viewer-settings', async (_event, viewer: ViewerSettings) => {
  orchestrator.settings.viewer = viewer;
  settingsStore.save(orchestrator.settings);
  return syncViewer();
});

ipcMain.handle('rotate-viewer-key', async () => {
  orchestrator.settings.viewer.key = generateViewerKey();
  settingsStore.save(orchestrator.settings);
  return syncViewer();
});

app.whenReady().then(async () => {
  // Decrypting saved settings needs the OS keychain, which is only available once the app is ready
  const loaded = settingsStore.load(defaultSettings);
  // Versions before the project picker saved the app's own folder here without anyone choosing it
  if (loaded.workspacePath === APP_ROOT) loaded.workspacePath = '';
  orchestrator.applySettings(loaded);
  createWindow();

  await controlServer.start().catch(err => console.error('[Main] Control server failed to start:', err));
  await syncViewer();
  void startUpdates(scheduleStateSend);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  controlServer.stop();
  viewerServer.stop();
  orchestrator.mcp.stopAll();
  settingsStore.flush();
  orchestrator.swarm.disconnectAll();
  if (process.platform !== 'darwin') app.quit();
});
