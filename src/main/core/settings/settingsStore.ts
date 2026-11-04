import fs from 'fs';
import path from 'path';
import { AppSettings } from '@shared/types';
import { RETIRED_MODELS } from '@shared/models';

/** The desktop app passes the OS keychain here. The headless server has no keychain. */
export interface SettingsCipher {
  isAvailable(): boolean;
  encrypt(text: string): Buffer;
  decrypt(data: Buffer): string;
}

/**
 * Saves settings to the user's data folder. API keys and /login commands live in here, so
 * the file is encrypted when a keychain exists and otherwise readable by its owner only.
 */
export class SettingsStore {
  private directory: string;
  private cipher?: SettingsCipher;
  private encryptedPath: string;
  private plainPath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private pending: AppSettings | null = null;

  constructor(directory: string, cipher?: SettingsCipher) {
    this.directory = directory;
    this.cipher = cipher;
    this.encryptedPath = path.join(directory, 'settings.enc');
    this.plainPath = path.join(directory, 'settings.json');
  }

  public get filePath(): string {
    return this.cipher?.isAvailable() ? this.encryptedPath : this.plainPath;
  }

  public exists(): boolean {
    return fs.existsSync(this.encryptedPath) || fs.existsSync(this.plainPath);
  }

  public load(defaults: AppSettings): AppSettings {
    const stored = this.read();
    if (!stored) return defaults;

    const providers: any = { ...defaults.providers };
    for (const [name, value] of Object.entries<any>(stored.providers || {})) {
      providers[name] = { ...providers[name], ...value };
      // A key set in the environment still applies until one is saved here
      if ('apiKey' in value && !value.apiKey) providers[name].apiKey = (defaults.providers as any)[name]?.apiKey;
      if (RETIRED_MODELS.includes(providers[name].model)) providers[name].model = (defaults.providers as any)[name]?.model;
    }

    return {
      ...defaults,
      ...stored,
      providers,
      minecraft: {
        ...defaults.minecraft,
        ...stored.minecraft,
        targets: { ...defaults.minecraft.targets, ...stored.minecraft?.targets }
      },
      agentRoles: { ...defaults.agentRoles, ...stored.agentRoles },
      viewer: { ...defaults.viewer, ...stored.viewer }
    };
  }

  /** Coalesces rapid edits, such as typing in a server field, into one write. */
  public save(settings: AppSettings) {
    this.pending = settings;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 400);
  }

  /** Writes any waiting change immediately. Call before the process exits. */
  public flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.pending) this.write(this.pending);
    this.pending = null;
  }

  private read(): Partial<AppSettings> | null {
    try {
      if (fs.existsSync(this.encryptedPath) && this.cipher?.isAvailable()) {
        return JSON.parse(this.cipher.decrypt(fs.readFileSync(this.encryptedPath)));
      }
      if (fs.existsSync(this.plainPath)) {
        return JSON.parse(fs.readFileSync(this.plainPath, 'utf8'));
      }
    } catch (err) {
      console.error('[Settings] Could not read saved settings, using defaults:', err);
    }
    return null;
  }

  private write(settings: AppSettings) {
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      const json = JSON.stringify(settings, null, 2);
      if (this.cipher?.isAvailable()) {
        fs.writeFileSync(this.encryptedPath, this.cipher.encrypt(json));
        fs.rmSync(this.plainPath, { force: true });
      } else {
        fs.writeFileSync(this.plainPath, json, { mode: 0o600 });
        // The mode above only applies when the file is first created
        fs.chmodSync(this.plainPath, 0o600);
      }
    } catch (err) {
      console.error('[Settings] Could not save settings:', err);
    }
  }
}
