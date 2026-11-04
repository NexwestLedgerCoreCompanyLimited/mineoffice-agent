import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { WorkspaceInfo } from '@shared/types';
import { t } from '@shared/i18n';
import { isSecretPath } from './codeChanges';

const execFileAsync = promisify(execFile);

const MAX_FILES_TO_ADOPT = 5000;
const PROJECTS_FOLDER = 'MineOfficeProjects';
const STARTER_IDENTITY = ['-c', 'user.name=MineOffice', '-c', 'user.email=mineoffice@mineoffice.invalid'];

function git(cwd: string, ...args: string[]): Promise<string> {
  return execFileAsync('git', args, {
    cwd,
    timeout: 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  }).then(result => result.stdout);
}

const samePath = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** A whole drive or a personal folder holds far more than one project, so an AI should not be pointed at it. */
function isTooBroad(folder: string): boolean {
  const resolved = path.resolve(folder);
  if (path.parse(resolved).root === resolved) return true;
  const home = os.homedir();
  return [home, ...['Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music'].map(name => path.join(home, name))]
    .some(personal => samePath(resolved, personal));
}

/** Reports what is needed before an AI can work in a folder. */
export async function inspectWorkspace(workspace: string, appRoot?: string): Promise<WorkspaceInfo> {
  if (!workspace) return { path: '', state: 'none' };

  const info: WorkspaceInfo = {
    path: workspace,
    state: 'ready',
    tooBroad: isTooBroad(workspace),
    isApp: !!appRoot && samePath(workspace, appRoot)
  };
  if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) return { ...info, state: 'missing' };

  try {
    await git(workspace, '--version');
  } catch {
    return { ...info, state: 'no-git' };
  }
  try {
    await git(workspace, 'rev-parse', '--show-toplevel');
  } catch {
    return { ...info, state: 'not-git' };
  }
  try {
    await git(workspace, 'rev-parse', '--verify', 'HEAD');
  } catch {
    return { ...info, state: 'no-commits' };
  }
  try {
    info.branch = (await git(workspace, 'symbolic-ref', '--short', 'HEAD')).trim();
  } catch {
    return { ...info, state: 'detached' };
  }

  const changes = await git(workspace, 'status', '--porcelain');
  info.changedFiles = changes.split('\n').filter(Boolean).length;
  return info;
}

/** Makes a fresh, ready-to-use project in a folder of its own, and returns where it is. */
export async function createNewProject(): Promise<string> {
  const parent = path.join(os.homedir(), PROJECTS_FOLDER);
  fs.mkdirSync(parent, { recursive: true });

  let folder = path.join(parent, 'my-project');
  for (let number = 2; fs.existsSync(folder); number++) {
    folder = path.join(parent, `my-project-${number}`);
  }
  fs.mkdirSync(folder);

  await git(folder, 'init', '-b', 'main');
  await git(folder, ...STARTER_IDENTITY, 'commit', '--allow-empty', '-m', 'Start project');
  return folder;
}

/**
 * Turns an existing folder into a project the AI can work in. The first commit holds what is
 * there now, so the AI's later changes show as a clean diff. Secret files are left out of it.
 */
export async function enableGit(workspace: string, appRoot?: string): Promise<{ ok: boolean; error?: string }> {
  const info = await inspectWorkspace(workspace, appRoot);
  if (info.tooBroad) return { ok: false, error: t('workspace.refuseBroad') };
  if (info.state !== 'not-git' && info.state !== 'no-commits') return { ok: true };

  try {
    if (info.state === 'not-git') await git(workspace, 'init', '-b', 'main');
    await git(workspace, 'add', '-A');

    const staged = (await git(workspace, 'diff', '--cached', '--name-only', '-z')).split('\0').filter(Boolean);
    if (staged.length > MAX_FILES_TO_ADOPT) {
      await git(workspace, 'reset', '-q');
      return { ok: false, error: t('workspace.tooManyFiles') };
    }

    // `git rm --cached` works before the first commit, when `git reset <file>` does not
    const secrets = staged.filter(isSecretPath);
    if (secrets.length > 0) await git(workspace, 'rm', '--cached', '-q', '--', ...secrets);

    await git(workspace, ...STARTER_IDENTITY, 'commit', '--allow-empty', '-m', 'Project as it was before MineOffice');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err.stderr || err.message).trim() };
  }
}
