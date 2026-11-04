// Runs the real orchestrator and real Git against a throwaway repo, with a scripted AI.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SwarmOrchestrator } from '@main/core/foreman/orchestrator';
import { createDefaultSettings } from '@main/core/settings/defaults';
import { createNewProject, enableGit, inspectWorkspace } from '@main/core/git/workspace';
import { setLanguage, t } from '@shared/i18n';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-code-'));
process.env.MINEOFFICE_HOME = path.join(TMP, 'home');
const REPO = path.join(TMP, 'repo');
const OUTSIDE = path.join(TMP, 'outside.txt');

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, extra: unknown = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra ? `\n      -> ${String(extra).slice(0, 500)}` : ''}`);
};
const git = (...args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (file: string, content: string) => {
  const full = path.join(REPO, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};
const read = (file: string) => fs.readFileSync(path.join(REPO, file), 'utf8');
const exists = (file: string) => fs.existsSync(path.join(REPO, file));
const branches = () => git('branch', '--list', 'mineoffice/*').trim();
const clean = () => git('status', '--porcelain').trim();

fs.mkdirSync(REPO, { recursive: true });
git('init', '-b', 'main');
git('config', 'user.name', 'Repo Owner');
git('config', 'user.email', 'owner@example.invalid');
write('src/auth.ts', 'export const login = () => false;\n');
write('src/keep.ts', 'export const keep = 1;\n');
write('old.txt', 'remove me\n');
write('.env', 'SECRET_TOKEN=hunter2-do-not-leak\n');
write('config/prod.pem', 'PRIVATE KEY MATERIAL\n');
write('.env.example', 'SECRET_TOKEN=\n');
write('package.json', '{"name":"demo"}\n');
git('add', '-A');
git('commit', '-m', 'first');
// A hook that would prove repo hooks ran during an agent commit
fs.writeFileSync(path.join(REPO, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\necho ran > "${path.join(TMP, 'hook-ran').replace(/\\/g, '/')}"\n`, { mode: 0o755 });
fs.writeFileSync(path.join(REPO, '.git', 'hooks', 'post-commit'), `#!/bin/sh\necho ran > "${path.join(TMP, 'hook-ran').replace(/\\/g, '/')}"\n`, { mode: 0o755 });

const settings = createDefaultSettings(REPO, 'th');
settings.activeDefaultProvider = 'ollama';
const orchestrator = new SwarmOrchestrator(settings);

// Scripted AI. Records every prompt so we can check what was sent out.
const prompts: string[] = [];
let answer = '';
let selection = '[]';
orchestrator.llm.complete = (async (messages: any[], options: any) => {
  prompts.push(`${options?.systemPrompt || ''}\n${messages.map(m => m.content).join('\n')}`);
  if (options?.systemPrompt?.includes('Choose up to')) return selection;
  return answer;
}) as any;

const FILE = (p: string, body: string) => `<<<MINEOFFICE_FILE ${p}\n${body}\nMINEOFFICE_END>>>`;
const juniper = () => orchestrator.getAgents().find(a => a.id === 'juniper')!;

async function run(title: string, ai: string, select = '["src/auth.ts"]') {
  answer = ai; selection = select;
  const task = orchestrator.createTask(title, title, 'code', 'juniper');
  await orchestrator.executeTask(task.id);
  const after = orchestrator.getTasks().find(t => t.id === task.id)!;
  const decision = orchestrator.getDecisions().find(d => d.taskId === task.id && d.status === 'pending');
  return { task: after, decision };
}

async function refused(name: string, ai: string, select?: string) {
  const before = git('rev-parse', 'HEAD');
  const { task, decision } = await run(`attack ${name}`, ai, select);
  const projectSame = git('rev-parse', 'HEAD') === before && clean() === '';
  check(`refused: ${name}`, task.status === 'backlog' && !!task.lastError && !decision && projectSame, JSON.stringify({ status: task.status, err: task.lastError, decision: !!decision, st: clean() }));
  check(`  no branch left behind: ${name}`, branches() === '', branches());
}

async function main() {
  console.log('\n== happy path');
  const first = await run('Add login', `SUMMARY: Make login check the password\n${FILE('src/auth.ts', 'export const login = (p: string) => p === "ok";')}\n${FILE('src/new/helper.ts', 'export const helper = 2;')}\n<<<MINEOFFICE_DELETE src/auth2.ts>>>`.replace('\n<<<MINEOFFICE_DELETE src/auth2.ts>>>', ''));
  check('waits for review', first.task.status === 'review' && !!first.decision, first.task.lastError);
  const diff = first.decision?.diffContent || '';
  check('real diff has the removed line', diff.includes('-export const login = () => false;'), diff);
  check('real diff has the added line', diff.includes('+export const login = (p: string) => p === "ok";'), diff);
  check('real diff has the new file', diff.includes('src/new/helper.ts'), diff);
  check('fake solution.ts is gone', !diff.includes('solution.ts'));
  check('summary shown to the reviewer', first.decision?.prompt === 'Make login check the password');
  check('stats are right', first.task.diffSummary?.filesChanged === 2 && first.task.diffSummary?.insertions === 2 && first.task.diffSummary?.deletions === 1, JSON.stringify(first.task.diffSummary));
  check('project untouched before approval', read('src/auth.ts').includes('=> false') && !exists('src/new/helper.ts') && clean() === '');
  check('commit exists on the branch', git('log', '--format=%s', '-1', first.task.worktreeBranch!).includes('Make login check'));
  check('author is the agent', git('log', '--format=%an', '-1', first.task.worktreeBranch!).trim() === 'MineOffice Agent');
  check('repo hooks did not run on AI code', !fs.existsSync(path.join(TMP, 'hook-ran')));
  check('checkout is outside the project', !fs.existsSync(path.join(REPO, '.agentcraft_worktrees')) && first.decision!.worktreePath!.startsWith(process.env.MINEOFFICE_HOME!), first.decision?.worktreePath);

  const result = await orchestrator.answerDecision(first.decision!.id, true);
  check('approve succeeds', result.ok, result.error);
  check('file really changed in the project', read('src/auth.ts').includes('p === "ok"'));
  check('new file really exists in the project', read('src/new/helper.ts').includes('helper = 2'));
  check('merge commit on main', /Merge mineoffice/.test(git('log', '--format=%s', '-1')));
  check('merged branch cleaned up', branches() === '', branches());
  check('checkout removed', !fs.existsSync(first.decision!.worktreePath!));
  check('task done', orchestrator.getTasks().find(t => t.id === first.task.id)!.status === 'done');
  check('second approval refused', !(await orchestrator.answerDecision(first.decision!.id, true)).ok);
  fs.rmSync(path.join(TMP, 'hook-ran'), { force: true });

  console.log('\n== send back with feedback');
  const back = await run('Tweak keep', `SUMMARY: tweak\n${FILE('src/keep.ts', 'export const keep = 2;')}`, '["src/keep.ts"]');
  const headBefore = git('rev-parse', 'HEAD');
  await orchestrator.answerDecision(back.decision!.id, false, 'Use 3 instead');
  check('rejected leaves the project alone', read('src/keep.ts').includes('keep = 1') && git('rev-parse', 'HEAD') === headBefore);
  check('rejected branch removed', branches() === '', branches());
  const retried = orchestrator.getTasks().find(t => t.id === back.task.id)!;
  check('task back to waiting, feedback kept', retried.status === 'backlog' && retried.reviewFeedback === 'Use 3 instead');
  answer = `SUMMARY: tweak again\n${FILE('src/keep.ts', 'export const keep = 3;')}`;
  selection = '["src/keep.ts"]';
  prompts.length = 0;
  await orchestrator.executeTask(back.task.id);
  check('retry tells the AI the feedback', prompts.some(p => p.includes('Use 3 instead')));
  const retryDecision = orchestrator.getDecisions().find(d => d.taskId === back.task.id && d.status === 'pending')!;
  await orchestrator.answerDecision(retryDecision.id, true);
  check('retry merged', read('src/keep.ts').includes('keep = 3'));

  console.log('\n== secrets never reach the AI provider');
  prompts.length = 0;
  await run('Read secrets', `SUMMARY: x\n${FILE('src/keep.ts', 'export const keep = 4;')}`, '[".env","config/prod.pem","../../outside.txt","src/keep.ts"]');
  const sent = prompts.join('\n');
  check('.env content not sent', !sent.includes('hunter2'));
  check('.pem content not sent', !sent.includes('PRIVATE KEY MATERIAL'));
  check('.env not even listed', !/^\.env$/m.test(sent));
  check('.pem not even listed', !sent.includes('prod.pem'));
  check('.env.example may be listed', sent.includes('.env.example'));
  const stale = orchestrator.getDecisions().find(d => d.status === 'pending');
  if (stale) await orchestrator.answerDecision(stale.id, false);

  console.log('\n== hostile output from the AI');
  fs.writeFileSync(OUTSIDE, 'original');
  await refused('path traversal', `SUMMARY: x\n${FILE('../../outside.txt', 'pwned')}`);
  check('  file outside the project untouched', fs.readFileSync(OUTSIDE, 'utf8') === 'original');
  await refused('backslash traversal', `SUMMARY: x\n${FILE('src\\..\\..\\..\\outside.txt', 'pwned')}`);
  await refused('absolute path', `SUMMARY: x\n${FILE(OUTSIDE.replace(/\\/g, '/'), 'pwned')}`);
  await refused('git hook', `SUMMARY: x\n${FILE('.git/hooks/pre-commit', 'pwned')}`);
  await refused('git folder, different case', `SUMMARY: x\n${FILE('.GIT/config', 'pwned')}`);
  await refused('git folder, trailing dot', `SUMMARY: x\n${FILE('.git./config', 'pwned')}`);
  await refused('git folder, short name', `SUMMARY: x\n${FILE('GIT~1/config', 'pwned')}`);
  await refused('Windows alternate stream', `SUMMARY: x\n${FILE('src/a.txt:evil', 'pwned')}`);
  await refused('Windows device name', `SUMMARY: x\n${FILE('src/nul.txt', 'pwned')}`);
  await refused('writing .env', `SUMMARY: x\n${FILE('.env', 'SECRET_TOKEN=stolen')}`);
  check('  .env untouched', read('.env').includes('hunter2'));
  await refused('replacing a file it never read', `SUMMARY: x\n${FILE('src/keep.ts', 'pwned')}`, '[]');
  await refused('deleting a file it never read', `SUMMARY: x\n<<<MINEOFFICE_DELETE old.txt>>>`, '[]');
  await refused('answer cut off mid file', `SUMMARY: x\n<<<MINEOFFICE_FILE src/auth.ts\nexport const lo`);
  await refused('same file twice', `SUMMARY: x\n${FILE('src/auth.ts', 'a')}\n${FILE('src/auth.ts', 'b')}`);
  await refused('no changes at all', 'I would rather not.');
  await refused('identical content', `SUMMARY: x\n${FILE('src/auth.ts', read('src/auth.ts').trimEnd())}`);
  const many = Array.from({ length: 41 }, (_, i) => FILE(`gen/f${i}.txt`, 'x')).join('\n');
  await refused('too many files', `SUMMARY: x\n${many}`);
  // One bad path among good ones must not leave a partial change
  await refused('good and bad path together', `SUMMARY: x\n${FILE('src/fine.ts', 'ok')}\n${FILE('../../outside.txt', 'pwned')}`);
  check('  file outside still untouched', fs.readFileSync(OUTSIDE, 'utf8') === 'original');

  console.log('\n== shell injection through a task title');
  const marker = path.join(TMP, 'injected').replace(/\\/g, '/');
  const evil = await run(`x"; echo hi > "${marker}"; echo "`, `SUMMARY: y" && echo hi > "${marker}" && echo "\n${FILE('src/title.ts', 'export const t = 1;')}`);
  check('title and summary run no command', !fs.existsSync(marker));
  check('task still works with those characters', !!evil.decision, evil.task.lastError);
  if (evil.decision) await orchestrator.answerDecision(evil.decision.id, false);

  console.log('\n== auto-run files are flagged');
  const pkg = await run('Change scripts', `SUMMARY: add script\n${FILE('package.json', '{"name":"demo","scripts":{"postinstall":"curl evil"}}')}`, '["package.json"]');
  check('package.json flagged for the reviewer', !!pkg.decision?.autoRunFiles?.includes('package.json'), JSON.stringify(pkg.decision?.autoRunFiles));
  if (pkg.decision) await orchestrator.answerDecision(pkg.decision.id, false);
  const plain = await run('Normal', `SUMMARY: s\n${FILE('src/plain.ts', 'export const p = 1;')}`);
  check('ordinary files are not flagged', plain.decision?.autoRunFiles?.length === 0);
  if (plain.decision) await orchestrator.answerDecision(plain.decision.id, false);

  console.log('\n== merge problems keep the work safe');
  const conflict = await run('Conflict', `SUMMARY: c\n${FILE('src/auth.ts', 'export const login = "from-agent";')}`);
  write('src/auth.ts', 'export const login = "from-owner";\n');
  git('add', '-A');
  git('commit', '-m', 'owner changed the same file');
  const headBeforeMerge = git('rev-parse', 'HEAD');
  const conflicted = await orchestrator.answerDecision(conflict.decision!.id, true);
  check('conflict is reported, not hidden', !conflicted.ok && !!conflicted.error, conflicted.error);
  check('project left as it was', git('rev-parse', 'HEAD') === headBeforeMerge && clean() === '' && read('src/auth.ts').includes('from-owner'), clean());
  check('no merge left half done', !exists('.git/MERGE_HEAD'));
  check('decision still pending', orchestrator.getDecisions().find(d => d.id === conflict.decision!.id)!.status === 'pending');
  check('task still in review', orchestrator.getTasks().find(t => t.id === conflict.task.id)!.status === 'review');
  check('branch kept so nothing is lost', branches().includes(conflict.task.worktreeBranch!));
  await orchestrator.answerDecision(conflict.decision!.id, false);

  const moved = await run('Moved branch', `SUMMARY: m\n${FILE('src/moved.ts', 'export const m = 1;')}`);
  git('checkout', '-q', '-b', 'other');
  const wrongBranch = await orchestrator.answerDecision(moved.decision!.id, true);
  check('will not merge into the wrong branch', !wrongBranch.ok && /สลับกลับ/.test(wrongBranch.error || ''), wrongBranch.error);
  check('other branch unchanged', !exists('src/moved.ts'));
  git('checkout', '-q', 'main');
  check('approves after switching back', (await orchestrator.answerDecision(moved.decision!.id, true)).ok && exists('src/moved.ts'));

  console.log('\n== bad workspaces explain themselves');
  const notRepo = path.join(TMP, 'plain-folder');
  fs.mkdirSync(notRepo);
  const plainSettings = createDefaultSettings(notRepo, 'th');
  plainSettings.activeDefaultProvider = 'ollama';
  orchestrator.applySettings(plainSettings);
  const noRepo = await run('No repo', 'x');
  check('non-Git folder gives a clear error', /ไม่ใช่ Git repo/.test(noRepo.task.lastError || ''), noRepo.task.lastError);
  const emptyRepo = path.join(TMP, 'empty-repo');
  fs.mkdirSync(emptyRepo);
  execFileSync('git', ['init', '-b', 'main'], { cwd: emptyRepo, stdio: 'ignore' });
  orchestrator.applySettings({ ...plainSettings, workspacePath: emptyRepo });
  const noCommit = await run('Empty repo', 'x');
  check('repo with no commits gives a clear error', /commit แรก/.test(noCommit.task.lastError || ''), noCommit.task.lastError);
  const subfolder = path.join(REPO, 'src');
  git('checkout', '-q', 'main');
  orchestrator.applySettings({ ...plainSettings, workspacePath: subfolder });
  const sub = await run('From a subfolder', `SUMMARY: s\n${FILE('src/sub.ts', 'export const s = 1;')}`);
  check('workspace set to a subfolder still finds the repo', !!sub.decision, sub.task.lastError);
  if (sub.decision) await orchestrator.answerDecision(sub.decision.id, false);

  console.log('\n== controls: would these attacks have worked without the guard?');
  orchestrator.applySettings({ ...plainSettings, workspacePath: REPO });
  // Control: the hook really does fire on an ordinary commit in this repo
  fs.rmSync(path.join(TMP, 'hook-ran'), { force: true });
  write('src/control.ts', 'export const c = 1;\n');
  git('add', '-A');
  git('commit', '-m', 'ordinary commit');
  check('control: hooks do run on an ordinary commit', fs.existsSync(path.join(TMP, 'hook-ran')));
  fs.rmSync(path.join(TMP, 'hook-ran'), { force: true });
  const hookCheck = await run('Hook check', `SUMMARY: h\n${FILE('src/hookcheck.ts', 'export const h = 1;')}`);
  check('same hook stays silent on the agent commit', !!hookCheck.decision && !fs.existsSync(path.join(TMP, 'hook-ran')), hookCheck.task.lastError);
  if (hookCheck.decision) await orchestrator.answerDecision(hookCheck.decision.id, false);

  // A link inside the checkout pointing outside the project
  const outsideDir = path.join(TMP, 'outside-dir');
  fs.mkdirSync(outsideDir);
  const wt = await orchestrator.git.createWorktree('juniper', 'linktest');
  const junction = path.join(wt.worktreePath, 'escape');
  fs.symlinkSync(outsideDir, junction, 'junction');
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'outside secret');
  // Control: without the guard, a write through the link lands outside the project
  fs.writeFileSync(path.join(junction, 'control.txt'), 'x');
  check('control: writing through the link does reach outside', fs.existsSync(path.join(outsideDir, 'control.txt')));
  let linkRefused = '';
  try {
    orchestrator.git.applyChanges(wt, { summary: '', files: [{ path: 'escape/pwned.txt', content: 'pwned' }], deletions: [] }, new Set());
  } catch (err: any) {
    linkRefused = err.message;
  }
  check('write through a link is refused', /link/.test(linkRefused) && !fs.existsSync(path.join(outsideDir, 'pwned.txt')), linkRefused);
  check('read through a link is refused', orchestrator.git.readFile(wt, 'escape/secret.txt') === null);
  fs.rmSync(junction, { recursive: false, force: true });
  await orchestrator.git.discardWorktree('juniper', 'linktest');

  console.log('\n== project folder help');
  const fakeHome = path.join(TMP, 'fakehome');
  fs.mkdirSync(path.join(fakeHome, 'Desktop'), { recursive: true });
  const realHome = process.env.USERPROFILE;
  const realHomeUnix = process.env.HOME;
  process.env.USERPROFILE = fakeHome;
  process.env.HOME = fakeHome;
  check('no folder chosen', (await inspectWorkspace('')).state === 'none');
  orchestrator.applySettings({ ...plainSettings, workspacePath: '' });
  const unset = await run('No folder', 'x');
  check('code work without a folder explains itself', /เลือกโฟลเดอร์โปรเจกต์/.test(unset.task.lastError || ''), unset.task.lastError);
  check('missing folder', (await inspectWorkspace(path.join(TMP, 'nope'))).state === 'missing');
  check('home folder is flagged as too broad', !!(await inspectWorkspace(fakeHome)).tooBroad);
  check('Desktop is flagged as too broad', !!(await inspectWorkspace(path.join(fakeHome, 'Desktop'))).tooBroad);
  check('a drive root is flagged as too broad', !!(await inspectWorkspace(path.parse(TMP).root)).tooBroad);
  check('the app itself is flagged', !!(await inspectWorkspace(REPO, REPO)).isApp);
  check('refuses to set up Git across the Desktop', !(await enableGit(path.join(fakeHome, 'Desktop'))).ok && !fs.existsSync(path.join(fakeHome, 'Desktop', '.git')));

  const created = await createNewProject();
  const createdInfo = await inspectWorkspace(created);
  check('new project is ready to use', createdInfo.state === 'ready' && createdInfo.branch === 'main' && created.includes('MineOfficeProjects'), JSON.stringify(createdInfo));
  check('a second new project does not reuse the first', (await createNewProject()) !== created);
  orchestrator.applySettings({ ...plainSettings, workspacePath: created });
  const inNew = await run('In a new project', `SUMMARY: first file\n${FILE('hello.ts', 'export const hello = 1;')}`, '[]');
  check('AI can work in a newly created project', !!inNew.decision, inNew.task.lastError);
  if (inNew.decision) {
    await orchestrator.answerDecision(inNew.decision.id, true);
    check('merged into the new project', fs.existsSync(path.join(created, 'hello.ts')));
  }

  const existing = path.join(TMP, 'existing-folder');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'code.ts'), 'export const c = 1;\n');
  fs.writeFileSync(path.join(existing, '.env'), 'SECRET=hunter2\n');
  check('existing folder is reported as not using Git', (await inspectWorkspace(existing)).state === 'not-git');
  check('sets up Git in an existing folder', (await enableGit(existing)).ok && (await inspectWorkspace(existing)).state === 'ready');
  const tracked = execFileSync('git', ['ls-files'], { cwd: existing, encoding: 'utf8' });
  check('its files are in the first commit', tracked.includes('code.ts'));
  check('secret files are left out of the commit', !tracked.includes('.env'), tracked);
  check('the secret file is still on disk', fs.existsSync(path.join(existing, '.env')));
  check('uncommitted changes are counted', (await inspectWorkspace(existing)).changedFiles === 1);
  process.env.USERPROFILE = realHome;
  process.env.HOME = realHomeUnix;

  console.log('\n== languages');
  orchestrator.applySettings({ ...plainSettings, workspacePath: '', language: 'en' });
  check('errors follow the language: English', t('workspace.notChosen').startsWith('Choose'));
  const english = await run('English error', 'x');
  check('task errors come in English when set', /Choose a project folder/.test(english.task.lastError || ''), english.task.lastError);
  orchestrator.applySettings({ ...plainSettings, workspacePath: '', language: 'th' });
  const thai = await run('Thai error', 'x');
  check('task errors come in Thai when set', /เลือกโฟลเดอร์/.test(thai.task.lastError || ''), thai.task.lastError);
  setLanguage('xx');
  check('an unknown language keeps the current one', t('nav.home') === 'ศูนย์สั่งการ');

  console.log('\n== fence and format tolerance');
  orchestrator.applySettings({ ...plainSettings, workspacePath: REPO });
  const fenced = await run('Fenced', `<think>hmm MINEOFFICE_END>>></think>\nSUMMARY: fenced\n<<<MINEOFFICE_FILE src/fenced.ts\n\`\`\`ts\nexport const f = 1;\n\`\`\`\nMINEOFFICE_END>>>`);
  check('wrapping code fence is removed', !!fenced.decision && !fenced.decision.diffContent!.includes('```'), fenced.task.lastError || fenced.decision?.diffContent);
  if (fenced.decision) await orchestrator.answerDecision(fenced.decision.id, false);

  console.log('\n== project rules');
  write('AGENTS.md', 'Always use tabs in this project.\n');
  git('add', '-A');
  git('commit', '-m', 'rules');
  prompts.length = 0;
  const ruled = await run('Ruled', `SUMMARY: ruled\n${FILE('src/ruled.ts', 'export const r = 1;')}`);
  const coding = prompts[prompts.length - 1] || '';
  check("the project's AGENTS.md reaches the AI as its rules", /wrote these rules[\s\S]*Always use tabs/.test(coding), coding.slice(0, 600));
  if (ruled.decision) await orchestrator.answerDecision(ruled.decision.id, false);
}

main()
  .catch(err => { failed++; console.log('CRASH', err); })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
    process.exit(failed ? 1 : 0);
  });
