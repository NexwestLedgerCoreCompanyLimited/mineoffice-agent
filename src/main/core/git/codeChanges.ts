/** The file changes an AI proposes, and the rules deciding which paths it may touch at all. */

export interface CodeChanges {
  summary: string;
  files: { path: string; content: string }[];
  deletions: string[];
}

export const CODE_OUTPUT_FORMAT = `Respond in exactly this format, with nothing outside it:
SUMMARY: one sentence describing the change
<<<MINEOFFICE_FILE path/relative/to/repo
the complete new content of the file
MINEOFFICE_END>>>
<<<MINEOFFICE_DELETE path/relative/to/repo>>>

Give the COMPLETE content of every file you change, never a fragment or a diff. Repeat the FILE block for each file. Only use DELETE to remove a file.`;

const FILE_START = /^<<<MINEOFFICE_FILE (.+)$/;
const FILE_END = 'MINEOFFICE_END>>>';
const FILE_DELETE = /^<<<MINEOFFICE_DELETE (.+)>>>$/;

/** Models sometimes wrap a whole file in a code fence, which must not end up in the file. */
function stripWrappingFence(lines: string[]): string[] {
  if (lines.length >= 2 && /^```/.test(lines[0]) && /^```\s*$/.test(lines[lines.length - 1])) {
    return lines.slice(1, -1);
  }
  return lines;
}

/**
 * Throws rather than guessing when the output is malformed. An answer cut off by the token
 * limit would otherwise overwrite a real file with half of its content.
 */
export function parseCodeChanges(response: string): CodeChanges {
  const lines = response
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .split('\n')
    .map(line => line.replace(/\r$/, ''));

  const changes: CodeChanges = { summary: '', files: [], deletions: [] };
  const seen = new Set<string>();
  const claim = (path: string) => {
    if (seen.has(path)) throw new Error(`The AI changed "${path}" more than once.`);
    seen.add(path);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('SUMMARY:') && !changes.summary) {
      changes.summary = line.slice('SUMMARY:'.length).trim();
      continue;
    }

    const removed = line.match(FILE_DELETE);
    if (removed) {
      claim(removed[1].trim());
      changes.deletions.push(removed[1].trim());
      continue;
    }

    const started = line.match(FILE_START);
    if (!started) continue;

    const end = lines.indexOf(FILE_END, i + 1);
    if (end === -1) throw new Error(`The AI's answer was cut off while writing "${started[1].trim()}". No files were changed.`);

    const body = stripWrappingFence(lines.slice(i + 1, end));
    claim(started[1].trim());
    changes.files.push({ path: started[1].trim(), content: `${body.join('\n')}\n` });
    i = end;
  }

  return changes;
}

// A device name is off limits on Windows even with an extension, as in "nul.txt"
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Returns the clean relative path, or throws if it could reach outside the project or into Git's own data. */
export function validateRepoPath(rawPath: string): string {
  const normalized = rawPath.trim().replace(/\\/g, '/');
  const refuse = (reason: string): never => {
    throw new Error(`Refused path "${rawPath}": ${reason}.`);
  };

  if (!normalized) refuse('it is empty');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) refuse('it is absolute');

  const segments = normalized.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.') refuse('it is not a clean relative path');
    if (segment === '..') refuse('it leaves the project');
    // Windows also treats ".git." and the short name "git~1" as the .git folder
    if (/^\.git[. ]*$/i.test(segment) || /^git~\d+$/i.test(segment)) refuse("it is inside Git's own data");
    if (/[. ]$/.test(segment)) refuse('Windows would rename it');
    if (/[<>:"|?*\x00-\x1F]/.test(segment)) refuse('it has characters a path cannot use');
    if (WINDOWS_DEVICE.test(segment)) refuse('it is a reserved device name');
  }
  return segments.join('/');
}

const SECRET_NAME = /^(\.env(\..*)?|\.npmrc|\.netrc|\.pypirc|id_(rsa|dsa|ecdsa|ed25519)|keys\.json|credentials(\..*)?|secrets?(\..*)?|settings\.enc)$/i;
const SECRET_EXTENSION = /\.(pem|key|p12|pfx|keystore|jks|kdbx)$/i;

/** Files that may hold secrets. They are never sent to an AI provider and an AI may not write them. */
export function isSecretPath(repoPath: string): boolean {
  const name = repoPath.split('/').pop() || '';
  // .env.example and friends are templates meant to be shared
  if (/\.(example|sample|template)$/i.test(name)) return false;
  return SECRET_NAME.test(name) || SECRET_EXTENSION.test(name);
}

const AUTO_RUN_FILE = /^(\.github\/workflows\/|\.gitlab-ci|\.husky\/|\.githooks\/|\.vscode\/tasks|\.gitattributes$|\.gitmodules$)|(^|\/)(package\.json|Makefile|Dockerfile|postinstall[^/]*)$/i;

/** Files whose content runs by itself later. A reviewer should look at these twice. */
export function isAutoRunPath(repoPath: string): boolean {
  return AUTO_RUN_FILE.test(repoPath);
}
