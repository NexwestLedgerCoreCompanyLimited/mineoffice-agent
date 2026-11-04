import mineflayer from 'mineflayer';
import mc from 'minecraft-protocol';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { ReflexEngine } from '../reflex/reflexLoop';
import {
  BotAccount,
  BotRuntimeState,
  BotStatus,
  MicrosoftAuthPrompt,
  MinecraftSettings,
  ServerTarget,
  ServerTestResult
} from '@shared/types';
import { SERVER_PACING, validateOfflineUsername, validateTarget } from '@shared/minecraft';
import { t } from '@shared/i18n';

export interface CommanderOrder {
  agentId: string; // the bot that heard the order
  sender: string;
  text: string;
  whisper: boolean;
}

interface SwarmCallbacks {
  onLog?: (agentId: string, level: string, msg: string) => void;
  onStateChange?: () => void;
  onOrder?: (order: CommanderOrder) => void;
  onPresence?: (agentId: string, online: boolean) => void;
  onAuthPrompt?: (agentId: string, account: string, prompt: MicrosoftAuthPrompt) => void;
}

interface BotSession {
  agentId: string;
  account: BotAccount;
  bot: any | null;
  reflexEngine: ReflexEngine | null;
  status: BotStatus;
  displayName: string;
  authPrompt?: MicrosoftAuthPrompt;
  lastError?: string;
  attempts: number;
  blockReconnect: boolean;
  timer: NodeJS.Timeout | null;
  chatQueue: string[];
  chatTimer: NodeJS.Timeout | null;
}

const MAX_CHAT_QUEUE = 20;
const SERVER_TEST_TIMEOUT_MS = 8000;

// Kick reasons where retrying cannot help and would only annoy the server
const PERMANENT_KICK = /whitelist|white-list|banned|ban\b|not allowed|verify username|invalid session|premium|outdated|version/i;

/** Flattens a Minecraft chat component (or JSON string of one) to plain text. */
export function chatToText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return chatToText(JSON.parse(trimmed));
      } catch {
        // Not JSON, fall through to the raw text
      }
    }
    return value.replace(/§./g, '');
  }
  if (Array.isArray(value)) return value.map(chatToText).join('');
  if (typeof value === 'object') {
    if (value.value !== undefined && value.type !== undefined) return chatToText(value.value); // NBT
    return [chatToText(value.text ?? value.translate ?? ''), chatToText(value.extra ?? '')].join('');
  }
  return String(value);
}

/** Turns a connection failure into an explanation the user can act on. */
function explainFailure(raw: string, target: ServerTarget): string {
  const text = raw.toLowerCase();
  if (text.includes('econnrefused')) return t('error.refused', { address: `${target.host}:${target.port}` });
  if (text.includes('enotfound') || text.includes('eai_again')) return t('error.notFound', { host: target.host });
  if (text.includes('etimedout') || text.includes('timed out') || text.includes('timeout')) return t('error.timeout', { host: target.host });
  if (text.includes('econnreset')) return t('error.reset');
  if (text.includes('verify username') || text.includes('invalid session')) return t('error.needsPremium');
  if (text.includes('whitelist') || text.includes('white-list')) return t('error.whitelist');
  if (text.includes('banned')) return t('error.banned', { detail: raw });
  if (text.includes('throttle')) return t('error.throttled');
  if (text.includes('is not supported') || text.includes('outdated') || text.includes('unsupported')) return t('error.version', { detail: raw });
  if (text.includes('does the account own minecraft')) return t('error.noMinecraft');
  return raw;
}

/** Pings a server without logging in, so it is safe to use on any server. */
export async function pingServer(target: ServerTarget): Promise<ServerTestResult> {
  const invalid = validateTarget(target);
  if (invalid) return { ok: false, error: invalid };

  const options: any = { host: target.host.trim(), port: target.port };
  if (target.version !== 'auto') options.version = target.version;

  let timeout: NodeJS.Timeout | undefined;
  try {
    const response: any = await Promise.race([
      mc.ping(options),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('timed out')), SERVER_TEST_TIMEOUT_MS);
      })
    ]);
    return {
      ok: true,
      versionName: response.version?.name,
      motd: chatToText(response.description).trim(),
      playersOnline: response.players?.online,
      playersMax: response.players?.max,
      latencyMs: response.latency
    };
  } catch (err: any) {
    return { ok: false, error: explainFailure(err.message || String(err), target) };
  } finally {
    clearTimeout(timeout);
  }
}

export class MineflayerSwarmManager {
  private sessions: Map<string, BotSession> = new Map();
  private settings: MinecraftSettings;
  private authCacheDir?: string;
  private callbacks: SwarmCallbacks;
  private nextJoinAt = 0;

  constructor(settings: MinecraftSettings, callbacks: SwarmCallbacks = {}, authCacheDir?: string) {
    this.settings = settings;
    this.callbacks = callbacks;
    this.authCacheDir = authCacheDir;
  }

  public updateSettings(settings: MinecraftSettings) {
    this.settings = settings;
  }

  private get target(): ServerTarget {
    return this.settings.targets[this.settings.kind];
  }

  private get pacing() {
    return SERVER_PACING[this.settings.kind];
  }

  public hasActiveSessions(): boolean {
    return Array.from(this.sessions.values()).some(s => s.status !== 'offline');
  }

  private accountFor(agentId: string, fallbackName: string): BotAccount {
    return (
      this.settings.accounts.find(a => a.agentId === agentId) || {
        agentId,
        authMode: 'offline',
        username: fallbackName
      }
    );
  }

  /** Queues a bot to join. Bots join one at a time so servers do not throttle them. */
  public spawnBot(agentId: string, fallbackName: string) {
    const existing = this.sessions.get(agentId);
    if (existing && existing.status !== 'offline') return;

    const account = this.accountFor(agentId, fallbackName);
    const session: BotSession = {
      agentId,
      account,
      bot: null,
      reflexEngine: null,
      status: 'queued',
      displayName: account.username,
      attempts: 0,
      blockReconnect: false,
      timer: null,
      chatQueue: [],
      chatTimer: null
    };
    this.sessions.set(agentId, session);

    const invalid =
      validateTarget(this.target) ||
      (account.authMode === 'offline'
        ? validateOfflineUsername(account.username)
        : account.username.trim()
        ? null
        : t('error.msAccountRequired'));
    if (invalid) {
      this.markOffline(session, invalid);
      return;
    }

    this.scheduleJoin(session, 0);
    this.notify();
  }

  private scheduleJoin(session: BotSession, minDelayMs: number) {
    const now = Date.now();
    const joinAt = Math.max(now + minDelayMs, this.nextJoinAt);
    this.nextJoinAt = joinAt + this.pacing.joinStaggerMs;
    session.timer = setTimeout(() => this.connect(session), joinAt - now);
  }

  private connect(session: BotSession) {
    session.timer = null;
    const { account, agentId } = session;
    const target = this.target;
    const isMicrosoft = account.authMode === 'microsoft';

    session.status = isMicrosoft ? 'authenticating' : 'connecting';
    this.log(agentId, 'info', `Connecting to ${target.host}:${target.port} as ${account.username} (${isMicrosoft ? 'Premium' : 'Offline'})...`);
    this.notify();

    const options: any = {
      host: target.host.trim(),
      port: target.port,
      username: account.username.trim(),
      auth: account.authMode,
      version: target.version === 'auto' ? false : target.version,
      hideErrors: true,
      logErrors: false
    };
    if (isMicrosoft) {
      options.profilesFolder = this.authCacheDir;
      options.onMsaCode = (data: any) => {
        session.authPrompt = {
          userCode: data.user_code,
          verificationUri: data.verification_uri,
          expiresAt: Date.now() + data.expires_in * 1000
        };
        this.log(agentId, 'warn', `Microsoft sign-in needed for ${account.username}. Waiting for the code to be entered.`);
        this.callbacks.onAuthPrompt?.(agentId, account.username, session.authPrompt);
        this.notify();
      };
    }

    let bot: any;
    try {
      bot = mineflayer.createBot(options);
    } catch (err: any) {
      this.markOffline(session, explainFailure(err.message || String(err), target));
      return;
    }

    session.bot = bot;
    session.reflexEngine = new ReflexEngine(bot);
    bot.loadPlugin(pathfinder);

    bot._client.on('session', (authSession: any) => {
      session.authPrompt = undefined;
      session.status = 'connecting';
      if (authSession?.selectedProfile?.name) session.displayName = authSession.selectedProfile.name;
      this.notify();
    });

    // Only online-mode servers ask for encryption during login, so an offline bot cannot get in
    bot._client.once('encryption_begin', () => {
      if (isMicrosoft || session.bot !== bot) return;
      session.blockReconnect = true;
      session.lastError = explainFailure('verify username', target);
      bot.end('premium required');
    });

    bot.once('spawn', () => this.handleSpawn(session, bot));

    bot.on('resourcePack', () => {
      try {
        bot.acceptResourcePack();
      } catch {
        // Older protocol versions accept packs differently; the server decides what happens next
      }
    });

    bot.on('chat', (sender: string, message: string) => this.handleChat(session, bot, sender, message, false));
    bot.on('whisper', (sender: string, message: string) => this.handleChat(session, bot, sender, message, true));

    bot.on('death', () => {
      this.log(agentId, 'warn', `Bot "${session.displayName}" died. Respawning automatically...`);
    });

    bot.on('kicked', (reason: any) => {
      const text = chatToText(reason) || 'Kicked by server';
      if (PERMANENT_KICK.test(text)) session.blockReconnect = true;
      session.lastError = explainFailure(text, target);
      this.log(agentId, 'error', `Bot "${session.displayName}" was kicked: ${session.lastError}`);
    });

    bot.on('error', (err: any) => {
      const message = explainFailure(err?.message || String(err), target);
      session.lastError = message;
      this.log(agentId, 'error', `Bot error: ${message}`);
      // Auth failures happen before any socket exists, so no 'end' event will follow
      if (session.status === 'authenticating' && session.bot === bot) {
        session.blockReconnect = true;
        this.handleEnd(session, bot);
      }
    });

    bot.on('end', () => this.handleEnd(session, bot));
  }

  private handleSpawn(session: BotSession, bot: any) {
    if (session.bot !== bot) return;
    session.status = 'online';
    session.attempts = 0;
    session.lastError = undefined;
    session.authPrompt = undefined;
    session.displayName = bot.username || session.displayName;
    this.log(session.agentId, 'success', `Bot "${session.displayName}" spawned in the world!`);
    this.callbacks.onPresence?.(session.agentId, true);

    const movements = new Movements(bot);
    // Walking around should never break someone else's build on a shared server
    if (this.settings.kind === 'public') movements.canDig = false;
    bot.pathfinder.setMovements(movements);

    if (this.settings.enableReflexes) {
      session.reflexEngine?.start();
      this.log(session.agentId, 'info', `20Hz Survival Reflex Layer activated for ${session.displayName}`);
    }

    // These may contain passwords (/login), so they are never written to the log
    const commands = this.target.postJoinCommands;
    commands.forEach(command => this.enqueueChat(session, command));
    if (commands.length > 0) this.log(session.agentId, 'info', `Sent ${commands.length} post-join command(s).`);
    this.notify();
  }

  private handleEnd(session: BotSession, bot: any) {
    if (session.bot !== bot) return; // Already handled, or this session was disconnected on purpose
    if (session.status === 'online') this.callbacks.onPresence?.(session.agentId, false);
    this.releaseBot(session);

    const { reconnectBaseMs, maxReconnects } = this.pacing;
    if (this.settings.autoReconnect && !session.blockReconnect && session.attempts < maxReconnects) {
      session.attempts++;
      const delay = Math.min(reconnectBaseMs * 2 ** (session.attempts - 1), 5 * 60 * 1000);
      session.status = 'reconnecting';
      this.log(session.agentId, 'warn', `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${session.attempts}/${maxReconnects})...`);
      this.scheduleJoin(session, delay);
      this.notify();
    } else {
      this.markOffline(session, session.lastError);
    }
  }

  private releaseBot(session: BotSession) {
    session.reflexEngine?.stop();
    session.reflexEngine = null;
    session.bot = null;
    session.chatQueue = [];
    if (session.chatTimer) clearTimeout(session.chatTimer);
    session.chatTimer = null;
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
  }

  private markOffline(session: BotSession, error?: string) {
    session.status = 'offline';
    session.authPrompt = undefined;
    session.lastError = error;
    if (error) this.log(session.agentId, 'error', `Bot "${session.displayName}" is offline: ${error}`);
    this.notify();
  }

  /** The library throws some version errors from inside socket callbacks; main routes them here. */
  public handleFatalConnectionError(err: Error) {
    for (const session of this.sessions.values()) {
      if (session.status === 'connecting' && session.bot) {
        session.blockReconnect = true;
        session.lastError = explainFailure(err.message, this.target);
        const bot = session.bot;
        this.handleEnd(session, bot);
        this.quietlyEnd(bot);
      }
    }
  }

  private quietlyEnd(bot: any) {
    try {
      // A client still waiting on Microsoft sign-in has no socket yet, so stop it when it gets one
      bot._client?.once('connect', () => bot._client.end('cancelled'));
      bot.end('disconnect');
    } catch {
      // Already closed
    }
  }

  public disconnectBot(agentId: string) {
    const session = this.sessions.get(agentId);
    if (!session) return;
    const bot = session.bot;
    if (session.status === 'online') this.callbacks.onPresence?.(agentId, false);
    this.releaseBot(session);
    this.sessions.delete(agentId);
    if (bot) this.quietlyEnd(bot);
    this.log(agentId, 'info', `Bot "${session.displayName}" disconnected.`);
    this.notify();
  }

  public disconnectAll() {
    for (const agentId of Array.from(this.sessions.keys())) {
      this.disconnectBot(agentId);
    }
    this.nextJoinAt = 0;
  }

  /** Resolves once the bot is in the world, or rejects with the reason it could not get there. */
  public waitUntilOnline(agentId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = setInterval(() => {
        const session = this.sessions.get(agentId);
        if (session?.status === 'online' && session.bot?.entity) {
          clearInterval(check);
          resolve();
        } else if (!session || session.status === 'offline') {
          clearInterval(check);
          reject(new Error(session?.lastError || 'Bot is offline'));
        } else if (Date.now() - startedAt > timeoutMs) {
          clearInterval(check);
          reject(new Error(t('error.joinTimeout')));
        }
      }, 300);
    });
  }

  public getBot(agentId: string): any | null {
    const session = this.sessions.get(agentId);
    return session?.status === 'online' ? session.bot : null;
  }

  public usesMicrosoftAuth(agentId: string, fallbackName: string): boolean {
    return this.accountFor(agentId, fallbackName).authMode === 'microsoft';
  }

  private onlineSessions(): BotSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'online' && s.bot);
  }

  private enqueueChat(session: BotSession, message: string): boolean {
    if (session.chatQueue.length >= MAX_CHAT_QUEUE) return false;
    session.chatQueue.push(message);
    if (!session.chatTimer) this.flushChat(session);
    return true;
  }

  private flushChat(session: BotSession) {
    const message = session.chatQueue.shift();
    if (message === undefined || !session.bot) {
      session.chatTimer = null;
      return;
    }
    try {
      session.bot.chat(message);
    } catch {
      // Socket closed between queueing and sending
    }
    session.chatTimer = setTimeout(() => this.flushChat(session), this.pacing.chatIntervalMs);
  }

  /** Sends through the per-bot queue, which paces messages so servers do not kick for spam. */
  public say(agentId: string, message: string): boolean {
    const session = this.sessions.get(agentId);
    if (!session || session.status !== 'online') return false;
    return this.enqueueChat(session, message);
  }

  /**
   * Sends a message from one bot, or from every online bot on a local server.
   * On public servers only the first bot speaks: identical lines from a crew read as spam.
   */
  public broadcastChat(message: string, agentId?: string): number {
    if (agentId) return this.say(agentId, message) ? 1 : 0;
    const online = this.onlineSessions();
    const speakers = this.settings.kind === 'public' ? online.slice(0, 1) : online;
    return speakers.filter(session => this.enqueueChat(session, message)).length;
  }

  private isCommander(name: string): boolean {
    const lower = name.toLowerCase();
    return this.settings.commanders.some(c => c.trim().toLowerCase() === lower);
  }

  private handleChat(session: BotSession, bot: any, sender: string, message: string, whisper: boolean) {
    if (session.bot !== bot || sender === bot.username) return;
    if (this.isOwnBot(sender)) return;

    // Every bot hears public chat, so a single listener handles it to avoid double orders
    const isListener = this.onlineSessions()[0] === session;
    if (!whisper && !isListener) return;

    const commander = this.isCommander(sender);
    // Public servers produce far too much chat to keep; only orders from commanders matter there
    if (this.settings.kind === 'local' || commander) {
      this.log(session.agentId, 'info', `[${whisper ? 'Whisper' : 'Chat'}] <${sender}>: ${message}`);
    }
    if (!commander) return;

    const prefix = this.settings.commandPrefix.trim();
    if (whisper) {
      const text = prefix && message.startsWith(prefix) ? message.slice(prefix.length).trim() : message.trim();
      if (text) this.callbacks.onOrder?.({ agentId: session.agentId, sender, text, whisper: true });
    } else if (prefix && message.startsWith(prefix)) {
      const text = message.slice(prefix.length).trim();
      if (text) this.callbacks.onOrder?.({ agentId: session.agentId, sender, text, whisper: false });
    }
  }

  private isOwnBot(name: string): boolean {
    return Array.from(this.sessions.values()).some(s => s.displayName === name);
  }

  public getBotState(agentId: string): BotRuntimeState | null {
    const session = this.sessions.get(agentId);
    return session ? this.serializeBotState(session) : null;
  }

  public getBotStates(): BotRuntimeState[] {
    return Array.from(this.sessions.values()).map(s => this.serializeBotState(s));
  }

  private serializeBotState(session: BotSession): BotRuntimeState {
    const state: BotRuntimeState = {
      agentId: session.agentId,
      username: session.displayName,
      authMode: session.account.authMode,
      status: session.status,
      connected: false,
      lastError: session.lastError,
      authPrompt: session.authPrompt
    };

    const b = session.bot;
    if (session.status !== 'online' || !b?.entity) return state;

    return {
      ...state,
      connected: true,
      health: b.health ?? 20,
      food: b.food ?? 20,
      position: {
        x: Math.round(b.entity.position.x * 10) / 10,
        y: Math.round(b.entity.position.y * 10) / 10,
        z: Math.round(b.entity.position.z * 10) / 10
      },
      heldItem: b.heldItem ? b.heldItem.name : 'empty',
      inventoryCount: b.inventory ? b.inventory.items().length : 0
    };
  }

  private log(agentId: string, level: string, msg: string) {
    this.callbacks.onLog?.(agentId, level, msg);
  }

  private notify() {
    this.callbacks.onStateChange?.();
  }
}
