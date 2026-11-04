// End-to-end checks of the built CLI against mock Minecraft and LLM servers.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const CLI = `${PROJECT}/dist-cli/cli.mjs`;
const HOME = path.join(os.tmpdir(), `mo-e2e-${Date.now()}`);
const VIEW = 'http://127.0.0.1:8788';
const SECRET_LOGIN = '/login super-secret-pass';
const SECRET_KEY = 'sk-or-e2e-secret-key';
const require = createRequire(`${PROJECT}/package.json`);
const mc = require('minecraft-protocol');

fs.mkdirSync(HOME, { recursive: true });
const env = { ...process.env, MINEOFFICE_HOME: HOME, OLLAMA_BASE_URL: 'http://127.0.0.1:11599' };
delete env.OPENROUTER_API_KEY;

let passed = 0, failed = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (name, ok, extra = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra ? `\n      -> ${String(extra).slice(0, 400)}` : ''}`);
};
const cli = (...args) => execFileSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const get = (route, headers = {}, method = 'GET') => fetch(VIEW + route, { method, headers, redirect: 'manual' });

function rawRequest(port, { host, origin, token, method = 'POST', route = '/tools/list', body = '{}', type = 'application/json' }) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': type, Host: host ?? `127.0.0.1:${port}` };
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(method === 'GET' ? undefined : body);
  });
}

class McpClient {
  constructor(args) {
    this.proc = spawn(process.execPath, [CLI, 'mcp', ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.buffer = ''; this.lines = []; this.pending = new Map(); this.id = 0; this.nonJson = [];
    this.stderr = '';
    this.proc.stderr.on('data', d => (this.stderr += d));
    this.proc.stdout.on('data', d => {
      this.buffer += d;
      let i;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, i); this.buffer = this.buffer.slice(i + 1);
        this.lines.push(line);
        try {
          const m = JSON.parse(line);
          if (this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); }
        } catch { this.nonJson.push(line); }
      }
    });
  }
  raw(text) { this.proc.stdin.write(text + '\n'); }
  request(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout ${method}`)), 15000);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.raw(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }
  async init() {
    const r = await this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
    this.raw(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    return r;
  }
  async call(name, args = {}) {
    const m = await this.request('tools/call', { name, arguments: args });
    const text = m.result?.content?.[0]?.text;
    let json; try { json = JSON.parse(text); } catch {}
    return { isError: !!m.result?.isError, text, json };
  }
  close() {
    return new Promise(resolve => { this.proc.once('exit', resolve); this.proc.stdin.end(); setTimeout(() => { this.proc.kill(); }, 4000); });
  }
}

let serve;
try {
  console.log('\n== init and config');
  const out = cli('init');
  const configPath = path.join(HOME, 'settings.json');
  check('init creates the config', fs.existsSync(configPath), out);
  let refused = false;
  try { cli('init'); } catch { refused = true; }
  check('init refuses to overwrite', refused);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.activeDefaultProvider = 'ollama';
  config.providers.ollama.model = 'mock';
  config.minecraft.targets.local.postJoinCommands = [SECRET_LOGIN];
  config.minecraft.accounts = [
    { agentId: 'wren', authMode: 'offline', username: 'WrenSecretName' },
    { agentId: 'kit', authMode: 'offline', username: 'KitBot' }
  ];
  fs.writeFileSync(configPath, JSON.stringify(config));

  console.log('\n== serve');
  serve = spawn(process.execPath, [CLI, 'serve', '--host', '127.0.0.1:25599', '--viewer', '--viewer-port', '8788', '--commander', 'BossPlayer'], {
    env: { ...env, OPENAI_API_KEY: SECRET_KEY }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let serveOut = '';
  serve.stdout.on('data', d => (serveOut += d));
  serve.stderr.on('data', d => (serveOut += d));
  await sleep(3500);
  check('serve starts', serve.exitCode === null, serveOut);
  const viewerKey = cli('viewer-key').trim();
  check('a viewer key was generated', viewerKey.length >= 20, viewerKey);
  check('key is not printed to a non-terminal log', !serveOut.includes(viewerKey), serveOut);
  const saved = fs.readFileSync(configPath, 'utf8');
  check('environment API key was not copied to disk', !saved.includes(SECRET_KEY));
  check('run-only flags were not saved', !saved.includes('BossPlayer') && !saved.includes('25599'));

  console.log('\n== control server');
  const control = JSON.parse(fs.readFileSync(path.join(HOME, 'control.json'), 'utf8'));
  const listening = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-NetTCPConnection -State Listen -LocalPort ${control.port}).LocalAddress`], { encoding: 'utf8' }).trim();
  check('control port listens on loopback only', listening === '127.0.0.1', listening);
  check('no token: rejected', (await rawRequest(control.port, {})) === 401);
  check('wrong token: rejected', (await rawRequest(control.port, { token: 'nope' })) === 401);
  check('right token: accepted', (await rawRequest(control.port, { token: control.token })) === 200);
  check('web page Origin: rejected even with token', (await rawRequest(control.port, { token: control.token, origin: 'https://evil.example' })) === 403);
  check('DNS rebinding Host: rejected even with token', (await rawRequest(control.port, { token: control.token, host: 'evil.example' })) === 403);
  check('GET: rejected', (await rawRequest(control.port, { token: control.token, method: 'GET' })) === 405);
  check('form post content type: rejected', (await rawRequest(control.port, { token: control.token, type: 'text/plain' })) === 415);
  check('too large a body: rejected', (await rawRequest(control.port, { token: control.token, body: 'x'.repeat(300 * 1024) }).catch(() => 413)) === 413);

  console.log('\n== MCP stdio attached to the running server');
  const mcp = new McpClient([]);
  const init = await mcp.init();
  check('initialize follows the protocol', init.result?.protocolVersion === '2025-06-18' && !!init.result?.capabilities?.tools && init.result?.serverInfo?.name === 'mineoffice', JSON.stringify(init));
  check('attached to the running app', /Attached/.test(mcp.stderr), mcp.stderr);
  const oldVersion = await mcp.request('initialize', { protocolVersion: '1999-01-01' });
  check('unknown protocol version falls back to a supported one', oldVersion.result?.protocolVersion === '2025-06-18');
  check('ping', !!(await mcp.request('ping')).result);
  check('unknown method is -32601', (await mcp.request('nope/nope')).error?.code === -32601);
  mcp.raw('{not json');
  await sleep(200);
  check('broken JSON gets -32700', mcp.lines.some(l => l.includes('-32700')));
  const tools = (await mcp.request('tools/list')).result.tools;
  check('tools are listed with schemas', tools.length >= 11 && tools.every(t => t.inputSchema?.type === 'object' && t.description), tools.length);
  const names = tools.map(t => t.name).join(' ');
  check('no tool exposes settings, merges, skills, or server changes', !/setting|key|merge|decision|answer|skill_add|set_server/i.test(names.replace('list_skills', '')), names);

  const state = await mcp.call('mineoffice_get_state');
  const stateText = JSON.stringify(state.json);
  check('get_state works', state.json?.agents?.length === 23, state.text);
  check('get_state has no secrets', !stateText.includes(SECRET_KEY) && !stateText.includes('super-secret'), stateText);
  check('get_state reports this run\'s server', state.json?.server?.port === 25599, stateText);

  check('slash command refused', (await mcp.call('mineoffice_send_chat', { message: '/op everyone' })).isError);
  check('padded slash command refused', (await mcp.call('mineoffice_send_chat', { message: '   /op everyone' })).isError);
  check('unknown tool is an error result', (await mcp.call('mineoffice_delete_everything')).isError);
  check('wrong argument type refused', (await mcp.call('mineoffice_plan_goal', { goal: 42 })).isError);
  check('oversized goal refused', (await mcp.call('mineoffice_plan_goal', { goal: 'x'.repeat(5000) })).isError);
  check('Commander cannot be moved off the role', (await mcp.call('mineoffice_set_role', { agentId: 'marlow', role: 'builder' })).isError);

  const connect = await mcp.call('mineoffice_connect_bots', { agentId: 'wren' });
  check('connect a bot', connect.json?.queued === true, connect.text);
  await sleep(2500);
  const after = (await mcp.call('mineoffice_get_state')).json.bots.find(b => b.agentId === 'wren');
  check('bot joined the server', after?.connected === true, JSON.stringify(after));

  const planned = await mcp.call('mineoffice_plan_goal', { goal: 'Report status', category: 'minecraft' });
  check('plan_goal delegates by role', Array.isArray(planned.json) && planned.json.length === 2, planned.text);
  const wrenTask = planned.json.find(t => t.assignedAgentId === 'wren');
  check('execute_task returns at once', (await mcp.call('mineoffice_execute_task', { taskId: wrenTask.id })).json?.started === true);
  await sleep(1500);
  const done = (await mcp.call('mineoffice_get_state')).json.tasks.find(t => t.id === wrenTask.id);
  check('the task really ran', done?.status === 'done', JSON.stringify(done));

  const xssTitle = '<img src=x onerror=window.__pwned=1><script>window.__pwned=2</script>';
  await mcp.call('mineoffice_create_task', { title: xssTitle, category: 'minecraft', agentId: 'wren' });
  await mcp.call('mineoffice_create_task', { title: '\u001b[2J\u001b[31mFAKE TERMINAL OUTPUT', category: 'minecraft', agentId: 'wren' });

  await mcp.request('tools/call', { name: 'mineoffice_get_logs', arguments: { agentId: 'wren' } });
  check('stdout carried only protocol messages', mcp.nonJson.length === 0, mcp.nonJson.join('|'));
  await mcp.close();

  const audit = fs.readFileSync(path.join(HOME, 'audit.log'), 'utf8');
  check('control actions are in the audit log', audit.includes('mineoffice_connect_bots') && audit.includes('mineoffice_plan_goal'));
  check('read-only calls are not audited', !audit.includes('mineoffice_get_state'));

  console.log('\n== MCP read-only mode');
  const ro = new McpClient(['--read-only']);
  await ro.init();
  const roTools = (await ro.request('tools/list')).result.tools;
  check('only read tools are offered', roTools.length === 4 && roTools.every(t => t.annotations.readOnlyHint), roTools.map(t => t.name).join());
  check('control tool refused', (await ro.call('mineoffice_disconnect_bots')).isError);
  check('bot was not disconnected', (await ro.call('mineoffice_get_state')).json.bots.some(b => b.connected));
  await ro.close();

  console.log('\n== rate limit on AI control calls');
  const limited = new McpClient([]);
  await limited.init();
  let refusedAt = 0;
  for (let i = 0; i < 40 && !refusedAt; i++) {
    const r = await limited.call('mineoffice_send_chat', { message: 'hi' });
    if (r.isError && /Too many/.test(r.text)) refusedAt = i;
  }
  check('runaway AI loop gets stopped', refusedAt > 0 && refusedAt <= 30, refusedAt);
  await limited.close();

  console.log('\n== viewer security');
  const info = await (await get('/api/info')).json();
  check('info says a key is required', info.requiresKey === true && info.app === 'mineoffice-viewer');
  check('no key: 401', (await get('/api/status')).status === 401);
  check('wrong key: 401', (await get('/api/status', { Authorization: 'Bearer wrong' })).status === 401);
  const statusRes = await get('/api/status', { Authorization: `Bearer ${viewerKey}` });
  check('right key: 200', statusRes.status === 200);
  const publicText = await statusRes.text();
  const publicData = JSON.parse(publicText);
  check('status has the team', publicData.agents.length === 23 && publicData.botsOnline >= 1);
  for (const [label, needle] of [
    ['API key', SECRET_KEY], ['login password', 'super-secret'], ['server address', '25599'], ['server host', '127.0.0.1'],
    ['bot account name', 'WrenSecretName'], ['viewer key', viewerKey], ['commander name', 'BossPlayer'], ['file paths', HOME.replace(/\\/g, '\\\\')],
    ['chat text', 'hack the server'], ['control token', control.token]
  ]) check(`status does not contain: ${label}`, !publicText.includes(needle));
  check('coordinates are hidden by default', publicData.agents.every(a => a.position === undefined));
  const page = await get('/');
  const csp = page.headers.get('content-security-policy') || '';
  check('CSP forbids inline script and framing', csp.includes("script-src 'self'") && !csp.includes('unsafe') && csp.includes("frame-ancestors 'none'"), csp);
  check('nosniff and no-referrer', page.headers.get('x-content-type-options') === 'nosniff' && page.headers.get('referrer-policy') === 'no-referrer');
  check('page has no CORS opening', !page.headers.get('access-control-allow-origin'));
  check('POST refused', (await get('/api/status', {}, 'POST')).status === 405);
  check('DELETE refused', (await get('/', {}, 'DELETE')).status === 405);
  for (const route of ['/assets/../../package.json', '/assets/..%2f..%2fpackage.json', '/settings.json', '/control.json', '/assets/portraits/../../../settings.json', '/.env']) {
    check(`not served: ${route}`, (await get(route)).status === 404);
  }
  check('allowlisted image is served', (await get('/assets/wren.png')).status === 200);
  check('logo is served', (await get('/assets/logo.png')).status === 200);

  console.log('\n== watch from outside');
  const watchEnv = { ...env, MINEOFFICE_VIEWER_KEY: viewerKey };
  const watched = execFileSync(process.execPath, [CLI, 'watch', '127.0.0.1:8788', '--once'], { env: watchEnv, encoding: 'utf8' });
  check('watch shows the team', /Wren/.test(watched) && /bots online/.test(watched), watched);
  check('watch strips terminal control codes', !watched.includes('\u001b'), JSON.stringify(watched));
  let noKeyOutput = '';
  try { execFileSync(process.execPath, [CLI, 'watch', '127.0.0.1:8788', '--once'], { env, encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { noKeyOutput = e.stdout; }
  check('watch without a key explains itself', /requires a key/.test(noKeyOutput), noKeyOutput);

  const fallback = mc.createServer({ 'online-mode': false, version: '1.16.5', port: 25565, host: '127.0.0.1', motd: 'plain server' });
  await sleep(300);
  // Not execFileSync: that would block this process, which is the one hosting the mock server
  const plain = await new Promise(resolve => {
    const child = spawn(process.execPath, [CLI, 'watch', '127.0.0.1:18999', '--once'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', d => (text += d));
    child.on('exit', () => resolve(text));
  });
  check('no viewer: falls back to the Minecraft ping', /Minecraft server is up/.test(plain), plain);
  fallback.close();

  console.log('\n== viewer brute force and flood');
  let lockedAt = 0;
  for (let i = 0; i < 15 && !lockedAt; i++) {
    const r = await get('/api/status', { Authorization: `Bearer guess-${i}` });
    if (r.status === 429) lockedAt = i;
  }
  check('key guessing gets locked out', lockedAt > 0 && lockedAt <= 10, lockedAt);
  check('even the right key waits during lockout', (await get('/api/status', { Authorization: `Bearer ${viewerKey}` })).status === 429);
  let floodedAt = 0;
  for (let i = 0; i < 140 && !floodedAt; i++) {
    const r = await get('/api/info');
    if (r.status === 429) floodedAt = i;
  }
  check('request flood gets rate limited', floodedAt > 0, floodedAt);

  console.log('\n== shutdown');
  serve.kill('SIGTERM');
  await sleep(1500);
  serve = null;

  console.log('\n== MCP standalone with nothing running');
  const alone = new McpClient(['--standalone']);
  await alone.init();
  check('standalone runs its own engine', /running the engine here/.test(alone.stderr), alone.stderr);
  check('standalone answers tools', (await alone.call('mineoffice_get_state')).json?.agents?.length === 23);
  const code = await alone.close();
  check('exits when the AI client closes stdin', code === 0, code);
  check('standalone stdout stayed clean', alone.nonJson.length === 0, alone.nonJson.join('|'));
  check('config file still has no env key', !fs.readFileSync(configPath, 'utf8').includes(SECRET_KEY));

  console.log('\n== misc');
  check('--help works', /Usage: mineoffice-agent/.test(cli('--help')));
  check('--version works', /^\d+\.\d+\.\d+/.test(cli('--version')));
  check('--print-config is valid JSON', !!JSON.parse(cli('mcp', '--print-config')).mcpServers.mineoffice);
  const rotated = cli('viewer-key', '--rotate').trim();
  check('viewer key can be rotated', rotated !== viewerKey && rotated.length >= 20);
} catch (err) {
  failed++;
  console.log('CRASH', err);
} finally {
  serve?.kill();
  fs.rmSync(HOME, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
