import { execFile } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { t } from '@shared/i18n';
import { mineofficeHome } from '../runtime/paths';
import { ImageAttachment } from '@shared/types';
import { detectImageType } from '../agent/images';
import { CodeChanges, isSecretPath, validateRepoPath } from './codeChanges';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 60 * 1000;
const GIT_MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_DIFF_CHARS = 400 * 1024;
const MAX_READ_BYTES = 256 * 1024;
const MAX_IMAGE_READ_BYTES = 5 * 1024 * 1024;
const MAX_CHANGED_FILES = 40;
const MAX_WRITTEN_BYTES = 1024 * 1024;

export interface GitWorktree {
  agentId: string;
  taskId: string;
  branch: string;
  baseBranch: string;
  baseCommit: string;
  worktreePath: string;
}

export interface DiffResult {
  hasChanges: boolean;
  rawDiff: string;
  truncated: boolean;
  filesChanged: string[];
  summary: {
    files: number;
    insertions: number;
    deletions: number;
  };
}

/**
 * Agents work on a branch in their own checkout, so nothing touches your files until you
 * approve the merge. Git runs without a shell, so a task title or branch can never become a command.
 */
export class GitWorktreeManager {
  private workspace: string;
  private activeWorktrees: Map<string, GitWorktree> = new Map();

  constructor(workspace: string) {
    this.workspace = workspace;
  }

  public setRepoRoot(workspace: string) {
    this.workspace = workspace;
  }

  private async git(cwd: string, ...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_OUTPUT_BYTES,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
    return stdout;
  }

  private async repoRoot(): Promise<string> {
    if (!this.workspace) throw new Error(t('workspace.notChosen'));
    if (!fs.existsSync(this.workspace)) {
      throw new Error(t('workspace.notFound', { path: this.workspace }));
    }
    try {
      return (await this.git(this.workspace, 'rev-parse', '--show-toplevel')).trim();
    } catch {
      throw new Error(t('workspace.notRepo', { path: this.workspace }));
    }
  }

  /** Kept outside the project so a checkout can never be swept up by a "git add -A" there. */
  private worktreesDirectory(root: string): string {
    const id = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12);
    const directory = path.join(mineofficeHome(), 'worktrees', id);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
  }

  /**
   * Creates an isolated checkout for an agent, branched from where the project is now,
   * or from a team's shared branch when one is given
   */
  public async createWorktree(agentId: string, taskId: string, baseRef = 'HEAD'): Promise<GitWorktree> {
    const root = await this.repoRoot();

    let baseCommit: string;
    try {
      baseCommit = (await this.git(root, 'rev-parse', '--verify', baseRef)).trim();
    } catch {
      throw new Error(t('workspace.noFirstCommit'));
    }

    let baseBranch: string;
    try {
      baseBranch = (await this.git(root, 'symbolic-ref', '--short', 'HEAD')).trim();
    } catch {
      throw new Error(t('workspace.detached'));
    }

    const branch = `mineoffice/${agentId}/${taskId}`;
    const worktreePath = path.join(this.worktreesDirectory(root), `${agentId}_${taskId}`);

    // Clear anything an earlier attempt or a closed app left behind
    await this.git(root, 'worktree', 'prune').catch(() => '');
    await this.git(root, 'worktree', 'remove', '--force', worktreePath).catch(() => '');
    fs.rmSync(worktreePath, { recursive: true, force: true });

    await this.git(root, 'worktree', 'add', '-B', branch, worktreePath, baseCommit);

    const wt: GitWorktree = { agentId, taskId, branch, baseBranch, baseCommit, worktreePath };
    this.activeWorktrees.set(`${agentId}_${taskId}`, wt);
    return wt;
  }

  /** Files an AI may be shown: tracked by Git, and not ones that look like they hold secrets. */
  public async listFiles(wt: GitWorktree): Promise<string[]> {
    const output = await this.git(wt.worktreePath, 'ls-files', '-z');
    return output.split('\0').filter(file => file && !isSecretPath(file));
  }

  /** Throws if a folder on the way to this path is a link, which could lead outside the project. */
  private assertNoLinks(wt: GitWorktree, repoPath: string) {
    let current = wt.worktreePath;
    for (const segment of repoPath.split('/')) {
      current = path.join(current, segment);
      if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new Error(`Refused path "${repoPath}": it goes through a link.`);
      }
    }
  }

  /** Reads a project file for the AI. Returns null for files it should not see or cannot use. */
  public readFile(wt: GitWorktree, rawPath: string): string | null {
    try {
      const repoPath = validateRepoPath(rawPath);
      if (isSecretPath(repoPath)) return null;
      this.assertNoLinks(wt, repoPath);

      const fullPath = path.join(wt.worktreePath, repoPath);
      const stats = fs.statSync(fullPath);
      if (!stats.isFile() || stats.size > MAX_READ_BYTES) return null;

      const data = fs.readFileSync(fullPath);
      if (data.includes(0)) return null; // Binary
      return data.toString('utf8');
    } catch {
      return null;
    }
  }

  /** A picture in the project, for an AI that can read images. Same rules as reading a file. */
  public readImage(wt: GitWorktree, rawPath: string): ImageAttachment | null {
    try {
      const repoPath = validateRepoPath(rawPath);
      if (isSecretPath(repoPath)) return null;
      this.assertNoLinks(wt, repoPath);

      const fullPath = path.join(wt.worktreePath, repoPath);
      const stats = fs.statSync(fullPath);
      if (!stats.isFile() || stats.size > MAX_IMAGE_READ_BYTES) return null;

      const data = fs.readFileSync(fullPath);
      const mimeType = detectImageType(data);
      return mimeType ? { name: repoPath, mimeType, base64: data.toString('base64') } : null;
    } catch {
      return null;
    }
  }

  /**
   * Writes an AI's changes into its checkout. Everything is checked before anything is written,
   * so a refused path means no change at all rather than half of one.
   * `seenFiles` are the files the AI was shown: it may not replace a file it has never read.
   */
  public applyChanges(wt: GitWorktree, changes: CodeChanges, seenFiles: Set<string>) {
    const count = changes.files.length + changes.deletions.length;
    if (count > MAX_CHANGED_FILES) throw new Error(`The AI tried to change ${count} files. The limit is ${MAX_CHANGED_FILES}.`);

    const writes = changes.files.map(file => {
      const repoPath = validateRepoPath(file.path);
      if (isSecretPath(repoPath)) throw new Error(`Refused path "${repoPath}": it may hold secrets.`);
      if (Buffer.byteLength(file.content) > MAX_WRITTEN_BYTES) throw new Error(`"${repoPath}" is larger than the limit for one file.`);
      this.assertNoLinks(wt, repoPath);
      const fullPath = path.join(wt.worktreePath, repoPath);
      if (fs.existsSync(fullPath) && !seenFiles.has(repoPath)) {
        throw new Error(`Refused path "${repoPath}": the AI tried to replace a file it had not read.`);
      }
      return { fullPath, content: file.content };
    });

    const deletions = changes.deletions.map(rawPath => {
      const repoPath = validateRepoPath(rawPath);
      if (isSecretPath(repoPath)) throw new Error(`Refused path "${repoPath}": it may hold secrets.`);
      this.assertNoLinks(wt, repoPath);
      if (!seenFiles.has(repoPath)) throw new Error(`Refused path "${repoPath}": the AI tried to delete a file it had not read.`);
      return path.join(wt.worktreePath, repoPath);
    });

    for (const { fullPath, content } of writes) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
    for (const fullPath of deletions) {
      fs.rmSync(fullPath, { force: true });
    }
  }

  /**
   * Commits on the agent's branch and returns the real diff from where it started.
   * Hooks stay off because the project's hook scripts may be among the files the AI just wrote,
   * and nobody has reviewed them yet. Signing stays off so a passphrase prompt cannot hang the task.
   */
  public async commitChanges(wt: GitWorktree, message: string): Promise<DiffResult> {
    await this.git(wt.worktreePath, 'add', '-A');
    const staged = await this.git(wt.worktreePath, 'diff', '--cached', '--name-only');
    if (!staged.trim()) return { hasChanges: false, rawDiff: '', truncated: false, filesChanged: [], summary: { files: 0, insertions: 0, deletions: 0 } };

    await this.git(
      wt.worktreePath,
      '-c', `core.hooksPath=${path.join(path.dirname(wt.worktreePath), 'no-hooks')}`,
      '-c', 'commit.gpgsign=false',
      '-c', 'user.name=MineOffice Agent',
      '-c', 'user.email=agent@mineoffice.invalid',
      'commit', '--no-verify', '-m', message
    );
    return this.getDiff(wt);
  }

  public async getDiff(wt: GitWorktree): Promise<DiffResult> {
    const range = [wt.baseCommit, wt.branch];
    const diff = await this.git(wt.worktreePath, 'diff', '--no-color', '--no-ext-diff', '--find-renames', ...range);
    const numstat = await this.git(wt.worktreePath, 'diff', '--numstat', '--no-ext-diff', '--find-renames', ...range);

    const rows = numstat.split('\n').filter(Boolean).map(row => row.split('\t'));
    const truncated = diff.length > MAX_DIFF_CHARS;
    return {
      hasChanges: rows.length > 0,
      rawDiff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff,
      truncated,
      filesChanged: rows.map(row => row[2]),
      summary: {
        files: rows.length,
        insertions: rows.reduce((sum, row) => sum + (Number(row[0]) || 0), 0),
        deletions: rows.reduce((sum, row) => sum + (Number(row[1]) || 0), 0)
      }
    };
  }

  public getWorktree(agentId: string, taskId: string): GitWorktree | undefined {
    return this.activeWorktrees.get(`${agentId}_${taskId}`);
  }

  /**
   * Merges an agent's branch into the project after you approve. If it cannot merge cleanly, the
   * project is left as it was and the branch is kept, so nothing is lost and you can try again.
   */
  public async mergeWorktree(agentId: string, taskId: string): Promise<{ success: boolean; message: string }> {
    const wt = this.activeWorktrees.get(`${agentId}_${taskId}`);
    if (!wt) return { success: false, message: t('review.taskGone') };

    const root = await this.repoRoot();

    const current = (await this.git(root, 'symbolic-ref', '--short', 'HEAD').catch(() => '')).trim();
    if (current !== wt.baseBranch) {
      return { success: false, message: t('review.wrongBranch', { base: wt.baseBranch, current: current || 'detached HEAD' }) };
    }

    // Someone new to Git may never have set a name, and Git refuses to commit without one
    const named = await this.git(root, 'config', 'user.name').then(() => this.git(root, 'config', 'user.email')).then(() => true, () => false);
    const identity = named ? [] : ['-c', 'user.name=MineOffice', '-c', 'user.email=mineoffice@mineoffice.invalid'];

    try {
      await this.git(root, ...identity, 'merge', '--no-ff', '--no-edit', '-m', `Merge ${wt.branch}, approved in MineOffice`, wt.branch);
    } catch (err: any) {
      await this.git(root, 'merge', '--abort').catch(() => '');
      const detail = String(err.stderr || err.stdout || err.message).trim();
      return { success: false, message: t('review.mergeFailed', { branch: wt.branch, detail }) };
    }

    await this.removeCheckout(root, wt);
    return { success: true, message: t('review.mergeDone', { branch: wt.branch, base: wt.baseBranch }) };
  }

  /**
   * Adds one agent's finished work to the team's shared branch. Your project is not touched.
   * If it conflicts, the shared branch stays as it was and the agent's checkout is kept.
   */
  public async mergeInto(target: GitWorktree, source: GitWorktree): Promise<{ success: boolean; message: string }> {
    try {
      await this.git(
        target.worktreePath,
        '-c', `core.hooksPath=${path.join(path.dirname(target.worktreePath), 'no-hooks')}`,
        '-c', 'commit.gpgsign=false',
        '-c', 'user.name=MineOffice Agent',
        '-c', 'user.email=agent@mineoffice.invalid',
        'merge', '--no-ff', '--no-edit', '-m', `Add ${source.branch}`, source.branch
      );
    } catch (err: any) {
      await this.git(target.worktreePath, 'merge', '--abort').catch(() => '');
      return { success: false, message: String(err.stdout || err.stderr || err.message).trim() };
    }
    await this.removeCheckout(await this.repoRoot(), source);
    return { success: true, message: `Added ${source.branch} to ${target.branch}.` };
  }

  /**
   * Throws away an agent's checkout and its branch
   */
  public async discardWorktree(agentId: string, taskId: string) {
    const wt = this.activeWorktrees.get(`${agentId}_${taskId}`);
    if (!wt) return;
    const root = await this.repoRoot().catch(() => this.workspace);
    await this.removeCheckout(root, wt);
  }

  private async removeCheckout(root: string, wt: GitWorktree) {
    await this.git(root, 'worktree', 'remove', '--force', wt.worktreePath).catch(() => '');
    fs.rmSync(wt.worktreePath, { recursive: true, force: true });
    // -D because a discarded branch was never merged. The merged one is simply deleted too.
    await this.git(root, 'branch', '-D', wt.branch).catch(() => '');
    this.activeWorktrees.delete(`${wt.agentId}_${wt.taskId}`);
  }
}
