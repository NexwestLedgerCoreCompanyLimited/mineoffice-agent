import { MinecraftSettings, ServerKind, ServerTarget } from './types';
import { t } from './i18n';

export const DEFAULT_MC_PORT = 25565;

export const MC_VERSION_OPTIONS = [
  'auto',
  '1.21.11',
  '1.21.8',
  '1.21.4',
  '1.21.1',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.18.2',
  '1.16.5',
  '1.12.2',
  '1.8.8'
];

/** Connection pacing per server kind. Public servers throttle joins and kick for chat spam. */
export const SERVER_PACING: Record<
  ServerKind,
  { joinStaggerMs: number; chatIntervalMs: number; reconnectBaseMs: number; maxReconnects: number }
> = {
  local: { joinStaggerMs: 1000, chatIntervalMs: 250, reconnectBaseMs: 5000, maxReconnects: 10 },
  public: { joinStaggerMs: 6000, chatIntervalMs: 1500, reconnectBaseMs: 15000, maxReconnects: 5 }
};

export function createDefaultMinecraftSettings(): MinecraftSettings {
  return {
    kind: 'local',
    targets: {
      local: { host: 'localhost', port: DEFAULT_MC_PORT, version: 'auto', postJoinCommands: [] },
      public: { host: '', port: DEFAULT_MC_PORT, version: 'auto', postJoinCommands: [] }
    },
    accounts: [],
    commanders: [],
    commandPrefix: '!mo',
    autoReconnect: true,
    enableReflexes: true,
    officeInWorld: true
  };
}

/** Splits a pasted "play.example.com:25566" address. Returns undefined port when none is given. */
export function parseServerAddress(address: string): { host: string; port?: number } {
  const trimmed = address.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  const match = trimmed.match(/^([^:]+):(\d{1,5})$/);
  if (!match) return { host: trimmed };
  return { host: match[1], port: Number(match[2]) };
}

export function validateTarget(target: ServerTarget): string | null {
  if (!target.host.trim()) return t('error.hostRequired');
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) {
    return t('error.portInvalid');
  }
  return null;
}

/** Minecraft only accepts these names for accounts without a premium login. */
export function validateOfflineUsername(username: string): string | null {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) {
    return t('error.usernameInvalid');
  }
  return null;
}
