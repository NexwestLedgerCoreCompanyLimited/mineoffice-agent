import { app } from 'electron';
import { UpdateState } from '@shared/types';

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export const RELEASES_URL = 'https://github.com/NexwestLedgerCoreCompanyLimited/mineoffice-agent/releases/latest';

let state: UpdateState = { status: 'none' };
let install: (() => void) | undefined;

export const updateState = () => state;

/**
 * Only the Windows installer and the AppImage can replace themselves. An unsigned Mac app and a
 * .deb install cannot, so they are told a new version exists and download it themselves.
 * Loaded late, because a problem with updates must never stop the app from opening.
 */
export async function startUpdates(onChange: () => void) {
  if (!app.isPackaged) return;
  const set = (next: UpdateState) => {
    state = next;
    onChange();
  };

  try {
    // A CommonJS package whose named exports ESM cannot see
    const { autoUpdater } = (await import('electron-updater')).default;
    const replacesItself = process.platform === 'win32' || !!process.env.APPIMAGE;
    autoUpdater.autoDownload = replacesItself;
    autoUpdater.on('update-available', info => {
      console.log('[Update] Found version', info.version);
      set(replacesItself ? { status: 'downloading', version: info.version, percent: 0 } : { status: 'available', version: info.version });
    });
    autoUpdater.on('download-progress', progress => {
      if (state.status === 'downloading') set({ ...state, percent: Math.floor(progress.percent) });
    });
    autoUpdater.on('update-downloaded', info => set({ status: 'ready', version: info.version }));
    autoUpdater.on('error', err => {
      console.error('[Update] Failed:', err.message);
      if (state.status === 'downloading') set({ status: 'none' });
    });
    install = () => autoUpdater.quitAndInstall(true, true);

    const check = () => {
      if (state.status === 'none') autoUpdater.checkForUpdates().catch(() => {});
    };
    check();
    setInterval(check, CHECK_EVERY_MS);
  } catch (err) {
    console.error('[Update] Could not start:', err);
  }
}

export function installUpdate() {
  if (state.status === 'ready') install?.();
}
