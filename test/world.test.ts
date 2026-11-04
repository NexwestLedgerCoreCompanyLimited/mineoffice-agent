// A real mineflayer bot, driven by the real engine, against flying-squid, a Minecraft server written
// in Node. Its crafting, containers, beds and farming are too incomplete to test those skills here,
// so those still need a vanilla or Paper server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { SwarmOrchestrator } from '@main/core/foreman/orchestrator';
import { createDefaultSettings } from '@main/core/settings/defaults';

const VERSION = process.argv[2] || '1.16.5';
const PORT = 25571;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-world-'));
process.env.MINEOFFICE_HOME = TMP;

const req = createRequire(path.resolve(process.env.MO_PROJECT_ROOT || '.', 'package.json'));
const squid = req('flying-squid');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const server = squid.createMCServer({
  motd: 'world test', port: PORT, 'max-players': 10, 'online-mode': false, logging: false,
  gameMode: 0, difficulty: 1, worldFolder: undefined,
  generation: { name: 'superflat', options: { worldHeight: 80 } },
  kickTimeout: 30000, plugins: {}, modpe: false, 'view-distance': 4,
  'player-list-text': { header: { text: '' }, footer: { text: '' } },
  'everybody-op': true, 'max-entities': 100, version: VERSION
});
server.on('error', (e: any) => console.log('[server error]', e?.message));

let passed = 0, failed = 0;
const report = (name: string, ok: boolean, detail: unknown) => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)?.slice(0, 260)}`);
};

async function main() {
  await sleep(3000);
  const settings = createDefaultSettings(TMP);
  settings.activeDefaultProvider = 'ollama';
  settings.minecraft.targets.local = { host: '127.0.0.1', port: PORT, version: VERSION, postJoinCommands: [] };
  settings.minecraft.enableReflexes = false;
  const o = new SwarmOrchestrator(settings, path.join(TMP, 'auth'));

  const agent = o.getAgents().find(a => a.role === 'builder')!;
  o.swarm.spawnBot(agent.id, agent.name);
  await o.swarm.waitUntilOnline(agent.id, 30000);
  const bot: any = o.swarm.getBot(agent.id);
  report('bot joined a real server', !!bot, { username: bot?.username, version: bot?.version });
  await bot.waitForChunksToLoad?.();
  await sleep(1500);

  const skill = async (id: string, args: any = {}, expect: 'ok' | 'fail' = 'ok', ms = 45000) => {
    const outcome: any = await Promise.race([
      o.skills.executeSkill(id, bot, args, { say: (m: string) => { bot.chat(m); return true; } }),
      sleep(ms).then(() => ({ success: false, error: `TIMED OUT after ${ms}ms` }))
    ]);
    report(`${id} ${JSON.stringify(args)}`, expect === 'ok' ? outcome.success : !outcome.success, outcome.success ? outcome.result : outcome.error);
    return outcome;
  };
  const give = async (item: string, count: number) => {
    bot.chat(`/give ${bot.username} ${item} ${count}`);
    await sleep(600);
  };
  const setblock = async (x: number, y: number, z: number, block: string) => {
    bot.chat(`/setblock ${x} ${y} ${z} ${block}`);
    await sleep(500);
  };

  const status = await skill('report-status');
  const pos = status.result.position;
  await skill('find-block', { blockName: 'dirt', radius: 16 });
  await skill('find-block', { blockName: 'not_a_block' }, 'fail');
  await skill('goto-position', { x: pos.x + 6, y: pos.y, z: pos.z + 2 });
  const after = bot.entity.position;
  report('the bot really moved', Math.abs(after.x - (pos.x + 6)) < 2.5, { x: after.x, z: after.z });

  await skill('mine-block', { blockName: 'grass', count: 1 });
  await sleep(1000);
  await skill('collect-drops', { radius: 8 });
  await skill('report-status');

  await give('oak_planks', 32);
  await skill('report-status');
  await skill('goto-position', { x: pos.x + 12, y: pos.y, z: pos.z + 8 });
  const here = bot.entity.position.floored();
  await skill('place-block', { x: here.x + 2, y: here.y, z: here.z, material: 'oak_planks' });
  await sleep(500);
  const placed = bot.blockAt(here.offset(2, 0, 0));
  report('the block is really in the world', placed?.name === 'oak_planks', placed?.name);
  await skill('place-block', { x: here.x + 2, y: here.y, z: here.z, material: 'oak_planks' }, 'fail');
  await skill('build-shelter-wall', { material: 'oak_planks', length: 3, height: 2 });
  await sleep(500);

  await give('bread', 3);
  await skill('equip-item', { itemName: 'bread', destination: 'hand' });
  bot.food !== undefined && console.log('food now', bot.food);
  await skill('eat-food', {}, bot.food < 20 ? 'ok' : 'fail', 8000); // Full food: the server refuses to let you eat

  bot.chat('/summon zombie');
  await sleep(1500);
  const zombie = bot.nearestEntity((e: any) => e.name === 'zombie');
  console.log('zombie seen:', zombie?.name, 'type:', zombie?.type);
  await skill('flee-danger', { seconds: 2 });
  await skill('defend-area', { radius: 16, seconds: 8 });

  await skill('stop-moving');
  await skill('flee-danger', { seconds: 1 });
  await skill('say-chat', { message: 'hello from the skill' });
  await skill('sleep-in-bed', {}, 'fail', 8000);
  await skill('harvest-crops', {}, 'fail', 8000);
  await skill('report-status');

  console.log('\n== the whole loop, through the engine');
  const steps = [
    { thought: 'see where I am', tool: 'report-status', args: {} },
    { thought: 'remember this', tool: 'remember_place', args: { name: 'camp' } },
    { thought: 'dig', tool: 'mine-block', args: { blockName: 'dirt', count: 1 } },
    { thought: 'walk back', tool: 'go_to_place', args: { name: 'camp' } },
    { done: true, report: 'dug a block and came back' }
  ];
  const prompts: string[] = [];
  o.llm.complete = (async (messages: any[]) => {
    prompts.push(messages[0].content);
    return JSON.stringify(steps.shift());
  }) as any;
  const miner = o.getAgents().find(a => a.role === 'miner')!;
  o.swarm.disconnectAll();
  await sleep(1000);
  o.swarm.spawnBot(miner.id, miner.name);
  await o.swarm.waitUntilOnline(miner.id, 30000);
  await sleep(1500);
  const task = o.createTask('Dig one block', 'Dig and return', 'minecraft', miner.id);
  await Promise.race([o.executeTask(task.id), sleep(90000)]);
  report('the dig really happened', /"blocksMined":1/.test(prompts[prompts.length - 1] || ''), prompts[prompts.length - 1]?.slice(-500));
  const finished = o.getTasks().find(t => t.id === task.id)!;
  report('a task ran through the loop in the real world', finished.status === 'done', { status: finished.status, error: finished.lastError });
  report('the real status reached the model', /"position":\{"x"/.test(prompts[0] || ''), prompts[0]?.slice(0, 200));

  o.swarm.disconnectAll();
}

main()
  .catch(err => { failed++; console.log('CRASH', err); })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed (version ${VERSION})`);
    try { server.close?.(); } catch {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
    setTimeout(() => process.exit(failed ? 1 : 0), 300);
  });
