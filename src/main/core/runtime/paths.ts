import fs from 'fs';
import os from 'os';
import path from 'path';

/** Shared by the desktop app, the headless server and the MCP bridge so they can find each other. */
export function mineofficeHome(): string {
  const home = process.env.MINEOFFICE_HOME || path.join(os.homedir(), '.mineoffice');
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  return home;
}

export function controlFilePath(): string {
  return path.join(mineofficeHome(), 'control.json');
}

/** Writes a file only its owner can read, for tokens and other secrets. */
export function writePrivateFile(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}
