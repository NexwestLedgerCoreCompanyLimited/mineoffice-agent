// The whole team working together: real Git, a scripted AI, and the real orchestrator.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SwarmOrchestrator } from '@main/core/foreman/orchestrator';
import { createDefaultSettings } from '@main/core/settings/defaults';
import { validateImages } from '@main/core/agent/images';
import { MultiLLMProvider } from '@main/core/llm/provider';
import { SettingsStore } from '@main/core/settings/settingsStore';
import { DEFAULT_MODELS, RETIRED_MODELS } from '@shared/models';
import { TEAM, TEAM_IDS } from '@shared/team';
import { ROLE_DEFINITIONS, ROLE_ORDER, inferRole, joinsWorld } from '@shared/roles';
import { LANGUAGES, tDynamic } from '@shared/i18n';
import { createDefaultMinecraftSettings } from '@shared/minecraft';
import type { Task } from '@shared/types';

const ROOT = path.resolve(process.env.MO_PROJECT_ROOT || '.');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-swarm-'));
process.env.MINEOFFICE_HOME = path.join(TMP, 'home');
fs.mkdirSync(process.env.MINEOFFICE_HOME, { recursive: true });

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, extra: unknown = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra !== '' ? `\n      -> ${String(extra).slice(0, 700)}` : ''}`);
};
const waitFor = async (test: () => boolean, ms = 20000) => {
  const start = Date.now();
  while (!test() && Date.now() - start < ms) await new Promise(r => setTimeout(r, 20));
  return test();
};

let repoCount = 0;
function makeRepo() {
  const repo = path.join(TMP, `repo${++repoCount}`);
  fs.mkdirSync(repo, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Owner');
  git('config', 'user.email', 'owner@example.invalid');
  fs.writeFileSync(path.join(repo, 'README.md'), 'start\n');
  git('add', '-A');
  git('commit', '-m', 'first');
  return { repo, git };
}

interface Call { system: string; user: string; images: number; maxTokens?: number }

/** A scripted AI. `reply` decides from what was asked, the way each role would answer. */
function makeTeam(repo: string, reply: (call: Call, calls: Call[]) => string | Promise<string>) {
  const settings = createDefaultSettings(repo);
  settings.activeDefaultProvider = 'ollama';
  const orchestrator = new SwarmOrchestrator(settings);
  const calls: Call[] = [];
  orchestrator.llm.complete = (async (messages: any[], options: any) => {
    const call: Call = {
      system: options?.systemPrompt || '',
      user: messages.map(m => m.content).join('\n'),
      images: messages.reduce((sum, m) => sum + (m.images?.length || 0), 0),
      maxTokens: options?.maxTokens
    };
    calls.push(call);
    return reply(call, calls);
  }) as any;
  return { orchestrator, calls, task: (id: string) => orchestrator.getTasks().find(t => t.id === id) as Task };
}

const isPlanning = (call: Call) => call.system.includes('the Commander of the MineOffice');
const isChoosingFiles = (call: Call) => call.system.includes('Choose up to');
const isReview = (call: Call) => call.system.includes('good enough to join');
const file = (p: string, body: string) => `SUMMARY: wrote ${p}\n<<<MINEOFFICE_FILE ${p}\n${body}\nMINEOFFICE_END>>>`;

function testRoster() {
  console.log('\n== the team');
  check('every role has somebody', ROLE_ORDER.every(role => TEAM.some(member => member.role === role)));
  check('names are unique', new Set(TEAM_IDS).size === TEAM_IDS.length);
  check('names work as Minecraft usernames', TEAM_IDS.every(id => /^[A-Za-z0-9_]{3,16}$/.test(id)), TEAM_IDS.join());
  for (const member of TEAM) {
    if (!fs.existsSync(path.join(ROOT, 'public/assets/portraits', `${member.id}.png`))) check(`portrait for ${member.id}`, false);
  }
  check('everyone has a portrait', TEAM.every(m => fs.existsSync(path.join(ROOT, 'public/assets/portraits', `${m.id}.png`))));
  check('every role has an icon', ROLE_ORDER.every(role => fs.existsSync(path.join(ROOT, 'public', ROLE_DEFINITIONS[role].icon))));

  const th = LANGUAGES.find(language => language.code === 'th')!.strings as Record<string, string>;
  const fields = ROLE_ORDER.flatMap(role => [`role.${role}.name`, `role.${role}.summary`]);
  check('every role has English text', fields.every(key => tDynamic(key) !== key), fields.filter(key => tDynamic(key) === key).join());
  check('every role has Thai text', fields.every(key => th[key]), fields.filter(key => !th[key]).join());
  const office = ROLE_ORDER.filter(role => !ROLE_DEFINITIONS[role].inGame);
  check('office roles list their duties', office.every(role => tDynamic(`role.${role}.duty1`) !== `role.${role}.duty1`));

  check('designers do not change code', !ROLE_DEFINITIONS.ux_designer.taskCategories.includes('code'));
  check('developers do', ROLE_DEFINITIONS.frontend.taskCategories.includes('code'));
  check('office staff cannot take in-game tasks', office.every(role => !ROLE_DEFINITIONS[role].taskCategories.includes('minecraft')));
  check('tests go to QA', inferRole('write tests for login', 'code') === 'qa');
  check('other code goes to a full-stack developer', inferRole('rename a thing', 'code') === 'coder');

  const local = createDefaultMinecraftSettings();
  check('office staff join a local world', joinsWorld('frontend', local));
  check('unless you turn that off', !joinsWorld('frontend', { ...local, officeInWorld: false }));
  check('they never join a public server', !joinsWorld('frontend', { ...local, kind: 'public' }));
  check('field crew always do', joinsWorld('miner', { ...local, kind: 'public', officeInWorld: false }));

  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('the license allows earning and forbids selling', /^Additional Use Grant:[\s\S]*to earn money[\s\S]*do not Sell the Licensed Work/m.test(license));
  check('the license becomes Apache 2.0', /^Change License: +Apache License, Version 2\.0$/m.test(license) && /^Change Date: +\d{4}-\d{2}-\d{2}$/m.test(license));
  check('the license names this version', license.includes(`MineOffice Agent ${pkg.version}\n`), pkg.version);
  check('the package points at it', pkg.license === 'BUSL-1.1' && pkg.files.includes('NOTICE.md'));
}

async function testPlanning() {
  console.log('\n== planning with dependencies');
  const { repo } = makeRepo();
  let plan = '[]';
  const { orchestrator, calls } = makeTeam(repo, call => (isPlanning(call) ? plan : 'ok'));

  plan = JSON.stringify([
    { id: 'a', title: 'A', description: 'a', assignedRole: 'product_manager', category: 'research' },
    { id: 'b', title: 'B', description: 'b', assignedRole: 'frontend', category: 'code', dependsOn: ['a', 'c', 'nope', 'b'] },
    { id: 'c', title: 'C', description: 'c', assignedRole: 'ux_designer', category: 'code', dependsOn: ['a'] }
  ]);
  const { tasks } = await orchestrator.planGoalWithDetails('Make an app', 'project');
  check('project plans use the office team', calls[0].system.includes('frontend') && !calls[0].system.includes('- miner'));
  check('dependencies become real', tasks[2].dependencies[0] === tasks[0].id, JSON.stringify(tasks[2].dependencies));
  check('a task cannot wait for a later task or itself, so no loops', tasks[1].dependencies.length === 1 && tasks[1].dependencies[0] === tasks[0].id, JSON.stringify(tasks[1].dependencies));
  check('requirements always wait for your approval', tasks[0].checkpoint === true);
  check('a developer task does not', tasks[1].checkpoint === false);
  check('a designer asked to write code writes a document instead', tasks[2].category === 'research');
  check('each task knows the overall goal', tasks[1].goal === 'Make an app');
  check('tasks are marked as one project', tasks.every(task => task.project));

  plan = JSON.stringify(Array.from({ length: 50 }, (_, n) => ({ id: `t${n}`, title: `T${n}`, description: 'x', assignedRole: 'backend', category: 'code' })));
  const big = await orchestrator.planGoalWithDetails('Huge', 'project');
  check('a project plan has a size limit', big.tasks.length === 30, big.tasks.length);

  plan = '[{"title":"Dig","description":"dig","assignedRole":"miner","dependsOn":[]}]';
  const game = await orchestrator.planGoalWithDetails('Dig', 'minecraft');
  check('in-game plans still work without ids', game.tasks.length === 1 && game.tasks[0].category === 'minecraft' && !game.tasks[0].project);

  plan = 'nonsense';
  const failedPlan = await orchestrator.planGoalWithDetails('Make something', 'project');
  check('a plan that fails becomes one task', failedPlan.tasks.length === 1 && failedPlan.tasks[0].project === true && !!failedPlan.error, JSON.stringify(failedPlan));
}

async function testOrderAndHandoff() {
  console.log('\n== order and handing work on');
  const { repo } = makeRepo();
  const started: string[] = [];
  let running = 0, peak = 0;
  const { orchestrator, calls, task } = makeTeam(repo, async call => {
    const title = /Task: (.*)/.exec(call.user)?.[1] || '';
    started.push(title);
    running++;
    peak = Math.max(peak, running);
    await new Promise(r => setTimeout(r, 30));
    running--;
    return `Result of ${title}`;
  });

  const spec = orchestrator.createTask('Spec', 'Write it', 'research', 'sage');
  const designA = orchestrator.createTask('Design A', 'A', 'research', 'iris');
  const designB = orchestrator.createTask('Design B', 'B', 'research', 'ellis');
  const last = orchestrator.createTask('Summary', 'All', 'research', 'ellis');
  designA.dependencies = [spec.id];
  designB.dependencies = [spec.id];
  last.dependencies = [designA.id, designB.id];

  const { done } = await orchestrator.startRun([last.id, designB.id, designA.id, spec.id]);
  await done;
  check('all finished', [spec, designA, designB, last].every(t => task(t.id).status === 'done'));
  check('order follows dependencies, not the list', started[0] === 'Spec' && started[started.length - 1] === 'Summary', started.join());
  check('tasks with nothing between them ran at once', peak >= 2, peak);
  const finalPrompt = calls[calls.length - 1].user;
  check('results reach the next worker', finalPrompt.includes('Result of Design A') && finalPrompt.includes('Result of Design B'), finalPrompt);
  check('so does earlier work, further back', finalPrompt.includes('Result of Spec'));
  check('it is marked as reference', /<teammate_work task="Spec" role="Product Manager">/.test(finalPrompt), finalPrompt);

  // Starting a task by hand must respect the same order
  const first = orchestrator.createTask('First', 'x', 'research', 'ellis');
  const second = orchestrator.createTask('Second', 'x', 'research', 'ellis');
  second.dependencies = [first.id];
  await orchestrator.executeTask(second.id);
  check('a task cannot jump the queue', task(second.id).status === 'backlog');

  // Only so many AI calls at once
  running = 0;
  peak = 0;
  const staff = ['sage', 'ellis', 'iris', 'fern', 'ash', 'briar', 'juniper', 'onyx'];
  const many = staff.map((id, n) => orchestrator.createTask(`Bulk ${n}`, 'x', 'research', id));
  await (await orchestrator.startRun(many.map(t => t.id))).done;
  check('8 people free, but at most 4 AI calls at once', peak === 4, peak);
  check('and the rest still get done', many.every(t => task(t.id).status === 'done'));
}

async function testPeers() {
  console.log('\n== two people with the same job');
  const { repo } = makeRepo();
  const { orchestrator, task } = makeTeam(repo, async () => {
    await new Promise(r => setTimeout(r, 40));
    return 'ok';
  });
  const one = orchestrator.createTask('Screen one', 'x', 'research', 'robin');
  const two = orchestrator.createTask('Screen two', 'x', 'research', 'robin');
  const { done } = await orchestrator.startRun([one.id, two.id]);
  await done;
  const owners = new Set([task(one.id).assignedAgentId, task(two.id).assignedAgentId]);
  check('a second frontend developer picks up the other task', owners.has('robin') && owners.has('hollis'), Array.from(owners).join());
}

async function testRetryAndStop() {
  console.log('\n== failures and stopping');
  const { repo } = makeRepo();
  let failures = 1;
  const { orchestrator, task } = makeTeam(repo, () => {
    if (failures-- > 0) throw new Error('The service is busy');
    return 'ok';
  });
  const flaky = orchestrator.createTask('Flaky', 'x', 'research', 'ellis');
  await (await orchestrator.startRun([flaky.id])).done;
  check('a passing failure is retried once', task(flaky.id).status === 'done', JSON.stringify(task(flaky.id)));

  failures = 100;
  const broken = orchestrator.createTask('Broken', 'x', 'research', 'ellis');
  const after = orchestrator.createTask('After', 'x', 'research', 'sage');
  after.dependencies = [broken.id];
  await (await orchestrator.startRun([broken.id, after.id])).done;
  check('a real failure stops and says why', task(broken.id).status === 'backlog' && /busy/.test(task(broken.id).lastError || ''));
  check('what depends on it does not start', task(after.id).status === 'backlog' && !task(after.id).lastError);
  failures = 0;
  await orchestrator.executeTask(broken.id);
  check('retrying it by hand picks the run back up', await waitFor(() => task(after.id).status === 'done'), JSON.stringify(task(after.id)));

  const queue = Array.from({ length: 3 }, (_, n) => orchestrator.createTask(`Q${n}`, 'x', 'research', 'ellis'));
  queue[1].dependencies = [queue[0].id];
  queue[2].dependencies = [queue[1].id];
  const { runId, done } = await orchestrator.startRun(queue.map(t => t.id));
  orchestrator.setRunStopped(runId, true);
  await done;
  check('stopping lets the current task finish and starts no more', task(queue[0].id).status === 'done' && task(queue[1].id).status === 'backlog', task(queue[1].id).status);
  orchestrator.setRunStopped(runId, false);
  check('and it can carry on', await waitFor(() => task(queue[2].id).status === 'done'));
}

async function testCheckpoints() {
  console.log('\n== you approve the plan and the design');
  const { repo } = makeRepo();
  let version = 0;
  const { orchestrator, calls, task } = makeTeam(repo, call => (call.user.includes('Task: Build') ? 'built' : `Spec version ${++version}`));
  orchestrator.canAskForApproval = true;

  const spec = orchestrator.createTask('Spec', 'Write it', 'research', 'sage');
  spec.checkpoint = true;
  const build = orchestrator.createTask('Build', 'x', 'research', 'ellis');
  build.dependencies = [spec.id];
  await (await orchestrator.startRun([spec.id, build.id])).done;

  const pending = () => orchestrator.getDecisions().find(d => d.type === 'approval' && d.status === 'pending');
  check('the work waits for you', task(spec.id).status === 'review' && task(build.id).status === 'backlog');
  check('and shows you what was written', pending()?.document === 'Spec version 1', JSON.stringify(pending()));

  await orchestrator.answerDecision(pending()!.id, false, 'Make it blue');
  check('sending it back redoes it', await waitFor(() => pending()?.document === 'Spec version 2'), JSON.stringify(pending()));
  const redo = calls.find(call => call.user.includes('Make it blue'));
  check('with your note and the last version', !!redo && redo.user.includes('Spec version 1'), redo?.user);
  check('nothing built on it yet', task(build.id).status === 'backlog');

  await orchestrator.answerDecision(pending()!.id, true);
  check('approving lets the team continue', await waitFor(() => task(build.id).status === 'done'));
  check('the next worker gets the approved version', calls[calls.length - 1].user.includes('Spec version 2'));

  orchestrator.canAskForApproval = false;
  const headless = orchestrator.createTask('Spec', 'Write it', 'research', 'sage');
  headless.checkpoint = true;
  await (await orchestrator.startRun([headless.id])).done;
  check('with nobody at a screen, it continues and says so', task(headless.id).status === 'done');
}

async function testProject() {
  console.log('\n== a whole project, on one shared branch');
  const { repo, git } = makeRepo();
  let reviewReply = '{"approved":true}';
  const { orchestrator, calls, task } = makeTeam(repo, (call, all) => {
    if (isChoosingFiles(call)) return '["README.md"]';
    if (isReview(call)) return reviewReply;
    if (call.user.includes('Task: Page')) return file('src/page.ts', 'export const page = 1;');
    if (call.user.includes('Task: Api')) return file('src/api.ts', 'export const api = 1;');
    if (call.user.includes('Task: Uses both')) return file('src/both.ts', 'export const both = 1;');
    if (call.user.includes('Task: Changes you asked for')) return file('src/fix.ts', 'export const fix = 1;');
    return `doc ${all.length}`;
  });
  orchestrator.canAskForApproval = true;

  const page = orchestrator.createTask('Page', 'x', 'code', 'robin');
  const api = orchestrator.createTask('Api', 'x', 'code', 'reed');
  const both = orchestrator.createTask('Uses both', 'x', 'code', 'juniper');
  both.dependencies = [page.id, api.id];
  for (const t of [page, api, both]) t.project = true;
  const before = git('rev-parse', 'HEAD').trim();

  await (await orchestrator.startRun([page.id, api.id, both.id])).done;
  check('all three tasks finished', [page, api, both].every(t => task(t.id).status === 'done'), JSON.stringify([page, api, both].map(t => [task(t.id).status, task(t.id).lastError])));
  check('your project has not changed', git('rev-parse', 'HEAD').trim() === before && !fs.existsSync(path.join(repo, 'src')));
  check('the Tech Lead read each change', calls.filter(isReview).length === 3, calls.filter(isReview).length);
  check('later work is built on earlier work', calls.some(call => call.user.includes('Task: Uses both') && call.user.includes('src/page.ts') && call.user.includes('src/api.ts')));
  check('there is no review per task', orchestrator.getDecisions().filter(d => d.status === 'pending').length === 1);

  const final = orchestrator.getDecisions().find(d => d.runId && d.status === 'pending')!;
  check('you get one review of everything', !!final && ['src/page.ts', 'src/api.ts', 'src/both.ts'].every(f => final.diffContent!.includes(f)), final?.diffContent);

  const asked = await orchestrator.answerDecision(final.id, false, 'Please add a fix');
  check('sending it back keeps the work', asked.ok && git('branch', '--list', 'mineoffice/project/*').trim().length > 0);
  const next = () => orchestrator.getDecisions().find(d => d.runId && d.status === 'pending');
  check('the team does what you asked', await waitFor(() => !!next() && next()!.id !== final.id), JSON.stringify(orchestrator.getDecisions().map(d => [d.type, d.status])));
  check('and you see it all again', next()!.diffContent!.includes('src/fix.ts') && next()!.diffContent!.includes('src/page.ts'));

  const merged = await orchestrator.answerDecision(next()!.id, true);
  check('approving merges it into your branch', merged.ok && ['src/page.ts', 'src/api.ts', 'src/both.ts', 'src/fix.ts'].every(f => fs.existsSync(path.join(repo, f))), JSON.stringify(merged));
  check('no branches are left behind', git('branch', '--list', 'mineoffice/*').trim() === '', git('branch', '--list', 'mineoffice/*'));
  check('your files are clean', git('status', '--porcelain').trim() === '');

  console.log('\n== the Tech Lead sends work back');
  const { repo: repo2, git: git2 } = makeRepo();
  let round = 0;
  const second = makeTeam(repo2, call => {
    if (isChoosingFiles(call)) return '["README.md"]';
    if (isReview(call)) return ++round === 1 ? '{"approved":false,"feedback":"Handle the empty case"}' : '{"approved":true}';
    return file('src/a.ts', `export const a = ${round};`);
  });
  const reviewed = second.orchestrator.createTask('Thing', 'x', 'code', 'reed');
  reviewed.project = true;
  await (await second.orchestrator.startRun([reviewed.id])).done;
  check('the developer gets the feedback and tries again', second.calls.some(call => !isChoosingFiles(call) && call.user.includes('Handle the empty case')) && second.task(reviewed.id).status === 'done', JSON.stringify(second.task(reviewed.id)));

  round = 100;
  const stubborn = makeTeam(makeRepo().repo, call => {
    if (isChoosingFiles(call)) return '["README.md"]';
    if (isReview(call)) return '{"approved":false,"feedback":"No"}';
    return file('src/b.ts', 'export const b = 1;');
  });
  const endless = stubborn.orchestrator.createTask('Thing', 'x', 'code', 'reed');
  endless.project = true;
  await (await stubborn.orchestrator.startRun([endless.id])).done;
  const reviews = stubborn.calls.filter(isReview).length;
  check('reviews cannot go round forever', reviews === 2 && stubborn.task(endless.id).status === 'done', `${reviews} ${stubborn.task(endless.id).status}`);

  const garbled = makeTeam(makeRepo().repo, call => {
    if (isChoosingFiles(call)) return '["README.md"]';
    if (isReview(call)) return 'I think it is fine?';
    return file('src/c.ts', 'export const c = 1;');
  });
  const unclear = garbled.orchestrator.createTask('Thing', 'x', 'code', 'reed');
  unclear.project = true;
  await (await garbled.orchestrator.startRun([unclear.id])).done;
  check('an unreadable review does not stop the team', garbled.task(unclear.id).status === 'done');

  console.log('\n== two developers change the same file');
  const conflict = makeRepo();
  fs.writeFileSync(path.join(conflict.repo, 'shared.txt'), 'one\n');
  conflict.git('add', '-A');
  conflict.git('commit', '-m', 'shared');
  const third = makeTeam(conflict.repo, call => {
    if (isChoosingFiles(call)) return '["shared.txt"]';
    if (isReview(call)) return '{"approved":true}';
    const who = call.user.includes('Task: Left') ? 'left' : 'right';
    return file('shared.txt', call.user.includes('conflicted') ? 'left\nright\n' : `${who}\n`);
  });
  const left = third.orchestrator.createTask('Left', 'x', 'code', 'robin');
  const right = third.orchestrator.createTask('Right', 'x', 'code', 'reed');
  left.project = true;
  right.project = true;
  await (await third.orchestrator.startRun([left.id, right.id])).done;
  check('the conflict is redone, not lost', third.task(left.id).status === 'done' && third.task(right.id).status === 'done', JSON.stringify([third.task(left.id).lastError, third.task(right.id).lastError]));
  const combined = third.orchestrator.getDecisions().find(d => d.runId && d.status === 'pending');
  check('both changes are in the result', !!combined?.diffContent?.includes('+left') && !!combined?.diffContent?.includes('+right'), combined?.diffContent);

  console.log('\n== guards still hold in a project');
  const evil = makeTeam(makeRepo().repo, call => {
    if (isChoosingFiles(call)) return '["README.md"]';
    if (isReview(call)) return '{"approved":true}';
    return file('.git/hooks/pre-commit', 'rm -rf /');
  });
  const attack = evil.orchestrator.createTask('Thing', 'x', 'code', 'reed');
  attack.project = true;
  await (await evil.orchestrator.startRun([attack.id])).done;
  check('a write into .git is refused', evil.task(attack.id).status === 'backlog' && /\.git/.test(evil.task(attack.id).lastError || ''), JSON.stringify(evil.task(attack.id)));

  const nowhere = makeTeam(path.join(TMP, 'does-not-exist'), () => 'x');
  const noRepo = nowhere.orchestrator.createTask('Thing', 'x', 'code', 'reed');
  noRepo.project = true;
  await (await nowhere.orchestrator.startRun([noRepo.id])).done;
  check('no project folder is explained, not hidden', !!nowhere.task(noRepo.id).lastError, JSON.stringify(nowhere.task(noRepo.id)));
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64').toString('base64');
const PICTURE = { name: 'style.png', mimeType: 'image/png', base64: PNG };

async function testImages() {
  console.log('\n== reading images');
  const throws = (value: unknown) => { try { validateImages(value); return false; } catch { return true; } };
  check('a real PNG is accepted', validateImages([PICTURE])[0].mimeType === 'image/png');
  check('the type comes from the bytes, not the claim', validateImages([{ ...PICTURE, mimeType: 'application/x-evil' }])[0].mimeType === 'image/png');
  check('a data URL prefix is removed', validateImages([{ ...PICTURE, base64: `data:image/png;base64,${PNG}` }])[0].base64 === PNG);
  check('a file that is not an image is refused', throws([{ name: 'x.png', base64: Buffer.from('#!/bin/sh\nrm -rf /').toString('base64') }]));
  check('an empty one is refused', throws([{ name: 'x.png', base64: '' }]));
  check('more than 5 is refused', throws(Array(6).fill(PICTURE)));
  check('more than 5 MB is refused', throws([{ name: 'x.png', base64: Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(6 * 1024 * 1024)]).toString('base64') }]));
  check('no images is fine', validateImages(undefined).length === 0);

  // What each service actually receives
  const realFetch = globalThis.fetch;
  let sent: any;
  let url = '';
  let answer: () => Response;
  globalThis.fetch = (async (target: string, init: any) => {
    url = String(target);
    sent = JSON.parse(init.body);
    return answer();
  }) as any;
  const json = (body: object) => () => new Response(JSON.stringify(body), { status: 200 });
  const settings = createDefaultSettings(TMP);
  settings.providers.openrouter.apiKey = 'k';
  settings.providers.gemini.apiKey = 'k';
  settings.providers.claude.apiKey = 'k';
  settings.providers.openai.apiKey = 'k';
  const llm = new MultiLLMProvider(settings);
  const message = [{ role: 'user' as const, content: 'Look', images: [PICTURE] }];

  answer = json({ choices: [{ message: { content: 'seen' } }] });
  settings.activeDefaultProvider = 'openai';
  check('OpenAI answers', (await llm.complete(message, { provider: 'openai' })) === 'seen');
  const openAiPart = sent.messages[0].content[1];
  check('OpenAI gets a data URL', openAiPart.type === 'image_url' && openAiPart.image_url.url === `data:image/png;base64,${PNG}`, JSON.stringify(sent));
  await llm.complete(message, { provider: 'openrouter' });
  check('OpenRouter gets the same', sent.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,') && url.includes('openrouter'));

  answer = json({ content: [{ type: 'text', text: 'seen' }] });
  await llm.complete(message, { provider: 'claude' });
  const claudePart = sent.messages[0].content[0];
  check('Claude gets raw base64 with its type', claudePart.type === 'image' && claudePart.source.type === 'base64' && claudePart.source.media_type === 'image/png' && claudePart.source.data === PNG, JSON.stringify(sent));
  check('Claude gets the text too', sent.messages[0].content[1].text === 'Look');

  answer = json({ candidates: [{ content: { parts: [{ text: 'seen' }] } }] });
  await llm.complete(message, { provider: 'gemini' });
  const geminiPart = sent.contents[0].parts[1];
  check('Gemini gets inline data', geminiPart.inline_data.mime_type === 'image/png' && geminiPart.inline_data.data === PNG, JSON.stringify(sent));

  answer = json({ message: { content: 'seen' } });
  settings.activeDefaultProvider = 'ollama';
  await llm.complete(message, { provider: 'ollama' });
  check('Ollama gets a list of images', sent.messages[0].images[0] === PNG && sent.messages[0].content === 'Look', JSON.stringify(sent));

  await llm.complete([{ role: 'user', content: 'Plain' }], { provider: 'ollama' });
  check('a message without images is unchanged', sent.messages[0].images === undefined && sent.messages[0].content === 'Plain');
  answer = json({ choices: [{ message: { content: 'seen' } }] });
  await llm.complete([{ role: 'user', content: 'Plain' }], { provider: 'openai' });
  check('and stays plain text for OpenAI', sent.messages[0].content === 'Plain');

  answer = () => new Response('this model does not support that', { status: 400 });
  const failure = await llm.complete(message, { provider: 'openai' }).catch(err => err.message);
  check('a model that cannot read images says what to do', /may not be able to read images/.test(failure), failure);
  const plainFailure = await llm.complete([{ role: 'user', content: 'Plain' }], { provider: 'openai' }).catch(err => err.message);
  check('other failures do not blame images', !/read images/.test(plainFailure), plainFailure);
  globalThis.fetch = realFetch;

  console.log('\n== images reach the right people');
  const { repo, git } = makeRepo();
  let plan = '';
  const { orchestrator, calls } = makeTeam(repo, call => {
    if (isPlanning(call)) return plan;
    if (isChoosingFiles(call)) return '["assets/mock.png","README.md"]';
    if (isReview(call)) return '{"approved":true}';
    return call.system.includes('MINEOFFICE_FILE') ? file('src/x.ts', 'export const x = 1;') : 'doc';
  });
  plan = JSON.stringify([
    { id: 'a', title: 'Design', description: 'x', assignedRole: 'ui_designer', category: 'research' },
    { id: 'b', title: 'Server', description: 'x', assignedRole: 'backend', category: 'code' }
  ]);
  const { tasks } = await orchestrator.planGoalWithDetails('Build it like this', 'project', [PICTURE]);
  check('the Commander sees your image', calls.find(isPlanning)!.images === 1);
  await orchestrator.startRun(tasks.map(t => t.id));
  await waitFor(() => tasks.every(t => orchestrator.getTasks().find(o => o.id === t.id)!.status === 'done'));
  const designer = calls.find(call => call.user.includes('Task: Design'));
  check('the UI Designer sees it', designer?.images === 1, designer?.images);
  const backend = calls.find(call => call.user.includes('Task: Server') && !isChoosingFiles(call) && !isReview(call));
  check('a backend developer does not, which saves credits', backend?.images === 0, backend?.images);

  fs.mkdirSync(path.join(repo, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'assets/mock.png'), Buffer.from(PNG, 'base64'));
  fs.writeFileSync(path.join(repo, 'assets/fake.png'), '#!/bin/sh');
  git('add', '-A');
  git('commit', '-m', 'images');
  calls.length = 0;
  const reader = orchestrator.createTask('Read mock', 'x', 'code', 'robin');
  await orchestrator.executeTask(reader.id);
  const coding = calls.find(call => call.system.includes('MINEOFFICE_FILE'));
  check('a developer can read an image in the project', coding?.images === 1, coding?.images);
  const pending = orchestrator.getDecisions().find(d => d.taskId === reader.id);
  if (pending) await orchestrator.answerDecision(pending.id, false, 'no');

  const worktree = await orchestrator.git.createWorktree('robin', 'image-check');
  check('a file named .png that is not an image is skipped', orchestrator.git.readImage(worktree, 'assets/fake.png') === null);
  check('a path outside the project is refused', orchestrator.git.readImage(worktree, '../../secret.png') === null);
  await orchestrator.git.discardWorktree('robin', 'image-check');
}

async function testServices() {
  console.log('\n== what each AI service is sent, and how its answer is read');
  const realFetch = globalThis.fetch;
  let sent: any, url = '', headers: any = {}, answer: object = {};
  globalThis.fetch = (async (target: string, init: any) => {
    url = String(target);
    headers = init.headers;
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as any;
  const settings = createDefaultSettings(TMP);
  for (const name of ['openrouter', 'gemini', 'claude', 'openai'] as const) settings.providers[name].apiKey = 'secret-key';
  const llm = new MultiLLMProvider(settings);
  const hello = [{ role: 'user' as const, content: 'Hi' }];

  answer = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'one ' }, { type: 'text', text: 'two' }] };
  check('Claude: the answer is found after a thinking block', (await llm.complete(hello, { provider: 'claude', temperature: 0.2 })) === 'one two');
  check('Claude: temperature is never sent', !('temperature' in sent), JSON.stringify(sent));
  check('Claude: there is room to think', sent.max_tokens >= 16000, sent.max_tokens);
  check('Claude: the default is a current model', sent.model === 'claude-sonnet-5-5', sent.model);
  answer = { stop_reason: 'refusal', content: [] };
  const refused = await llm.complete(hello, { provider: 'claude' }).then(() => '', err => err.message);
  check('Claude: a refusal is an error, not an empty answer', refused.includes('declined'), refused);

  answer = { choices: [{ message: { content: 'ok' } }] };
  await llm.complete(hello, { provider: 'openai', temperature: 0.2 });
  check('OpenAI: GPT-6 gets the fields it accepts', !('temperature' in sent) && !('max_tokens' in sent) && sent.max_completion_tokens >= 16000, JSON.stringify(sent));
  settings.providers.openai.baseUrl = 'http://localhost:1234/v1';
  await llm.complete(hello, { provider: 'openai', temperature: 0.2 });
  check('OpenAI: compatible services keep the older fields', sent.temperature === 0.2 && sent.max_tokens === 2048 && !('max_completion_tokens' in sent), JSON.stringify(sent));
  delete settings.providers.openai.baseUrl;

  answer = { candidates: [{ content: { parts: [{ text: 'hmm', thought: true }, { text: 'one ' }, { text: 'two' }] } }] };
  check('Gemini: thoughts are left out and parts are joined', (await llm.complete(hello, { provider: 'gemini' })) === 'one two');
  check('Gemini: the key stays out of the URL', !url.includes('secret-key') && headers['x-goog-api-key'] === 'secret-key', url);

  answer = { choices: [{ message: { content: 'ok' } }] };
  await llm.complete(hello, { provider: 'openrouter' });
  check('OpenRouter: the default survives free models changing', sent.model === 'openrouter/free', sent.model);
  globalThis.fetch = realFetch;

  const folder = path.join(TMP, 'old-settings');
  fs.mkdirSync(folder, { recursive: true });
  const old = createDefaultSettings(folder);
  old.providers.openrouter.model = RETIRED_MODELS[0];
  old.providers.gemini.model = 'gemini-2.5-flash';
  old.providers.openai.model = 'my-own-model';
  fs.writeFileSync(path.join(folder, 'settings.json'), JSON.stringify(old));
  const loaded = new SettingsStore(folder).load(createDefaultSettings(folder));
  check('a saved model that is gone moves to the current one', loaded.providers.openrouter.model === DEFAULT_MODELS.openrouter && loaded.providers.gemini.model === DEFAULT_MODELS.gemini);
  check('a model you chose yourself is left alone', loaded.providers.openai.model === 'my-own-model');
}

async function testBusinessTeam() {
  console.log('\n== office, marketing and creative departments');
  check('social media goes to the social manager', inferRole('ทำโพสต์เฟซบุ๊กโปรโมตร้าน', 'research') === 'social_media');
  check('campaigns go to marketing', inferRole('Plan a launch campaign', 'research') === 'marketer');
  check('customer replies go to support', inferRole('ร่างคำตอบลูกค้าเรื่องคืนเงิน', 'research') === 'customer_support');
  check('schedules go to the admin', inferRole('จัดตารางงานสัปดาห์หน้า', 'research') === 'admin');
  check('scripts for video go to the producer', inferRole('Plan a video for the launch', 'research') === 'video_producer');
  check('logos go to the graphic designer', inferRole('ออกแบบโลโก้ร้าน', 'code') === 'graphic_designer');
  check('plain research still goes to the analyst', inferRole('Compare two databases', 'research') === 'business_analyst');
  check('those who cannot publish say so', ['social_media', 'customer_support', 'admin'].every(role => /cannot/.test(ROLE_DEFINITIONS[role as 'admin'].prompt)));
  check('every department is in the chart', ROLE_ORDER.every(role => ['command', 'field', 'product', 'design', 'engineering', 'quality', 'admin', 'marketing', 'creative'].includes(ROLE_DEFINITIONS[role].department)));

  const { repo, git } = makeRepo();
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
  const { orchestrator, calls, task } = makeTeam(repo, call => {
    if (isPlanning(call)) return JSON.stringify([
      { id: 'a', title: 'Month of posts', description: 'Write them', assignedRole: 'social_media', category: 'code', dependsOn: [] },
      { id: 'b', title: 'Cafe logo', description: 'Draw it', assignedRole: 'graphic_designer', category: 'code', dependsOn: ['a'] }
    ]);
    if (isChoosingFiles(call)) return '[]';
    if (isReview(call)) return '{"approved":true}';
    if (call.user.includes('Task: Cafe logo')) return file('brand/logo.svg', SVG);
    return 'Week 1: opening post';
  });
  orchestrator.canAskForApproval = true;

  const { tasks } = await orchestrator.planGoalWithDetails('Plan posts and a logo for a cafe', 'project');
  check('the Commander is told about the new departments', calls[0].system.includes('- social_media:') && calls[0].system.includes('- graphic_designer:') && calls[0].system.includes('skip the software steps'));
  check('work goes to the right person', task(tasks[0].id).assignedAgentId === 'lark' && task(tasks[1].id).assignedAgentId === 'indigo', JSON.stringify(tasks.map(t => t.assignedAgentId)));
  check('a role that only writes stays on written work', task(tasks[0].id).category === 'research');
  check('the graphic designer can change files', task(tasks[1].id).category === 'code');

  await (await orchestrator.startRun(tasks.map(t => t.id))).done;
  check('both tasks finished', tasks.every(t => task(t.id).status === 'done'), JSON.stringify(tasks.map(t => [task(t.id).status, task(t.id).lastError])));
  check('the post plan is kept as a result', !!task(tasks[0].id).result?.includes('Week 1'));
  check('the designer sees what came before', calls.some(call => call.user.includes('Task: Cafe logo') && call.user.includes('Week 1')));

  const final = orchestrator.getDecisions().find(d => d.runId && d.status === 'pending')!;
  check('you review the drawing first', !!final && final.diffContent!.includes('brand/logo.svg'), final?.diffContent);
  await orchestrator.answerDecision(final.id, true);
  check('approving puts the SVG in your project', fs.existsSync(path.join(repo, 'brand/logo.svg')) && fs.readFileSync(path.join(repo, 'brand/logo.svg'), 'utf8').trim() === SVG, git('log', '--oneline'));
}

async function main() {
  testRoster();
  await testPlanning();
  await testOrderAndHandoff();
  await testPeers();
  await testRetryAndStop();
  await testCheckpoints();
  await testProject();
  await testImages();
  await testServices();
  await testBusinessTeam();
}

main()
  .catch(err => { failed++; console.log('CRASH', err); })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
    process.exit(failed ? 1 : 0);
  });
