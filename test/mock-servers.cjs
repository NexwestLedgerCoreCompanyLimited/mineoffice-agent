// Test doubles for the Electron run: Minecraft protocol servers and a fake Ollama LLM.
// Offline server :25599 (1.16.5), online-mode server :25598, Ollama-compatible LLM :11599.
const http = require('http');
const mc = require('minecraft-protocol');
const VERSION = '1.16.5';
const mcData = require('minecraft-data')(VERSION);

const log = (...a) => console.log('[mock]', ...a);
var codeRuns = 0;

const offline = mc.createServer({ 'online-mode': false, version: VERSION, port: 25599, host: '127.0.0.1', motd: 'Mock Offline Server', maxPlayers: 50 });
const clients = new Set();
offline.on('login', client => {
  clients.add(client);
  log('offline login', client.username);
  client.on('end', () => { clients.delete(client); log('left', client.username); });
  client.on('chat', p => log('chat from', client.username + ':', p.message));
  client.write('login', {
    ...mcData.loginPacket,
    entityId: client.id,
    maxPlayers: 50
  });
  client.write('position', { x: 0, y: 64, z: 0, yaw: 0, pitch: 0, flags: 0, teleportId: 1 });
  client.write('update_health', { health: 20, food: 20, foodSaturation: 5 });

  // Scripted player chat. Vanilla-style lines from a commander, a stranger and a custom format.
  const say = (text) => client.write('chat', { message: JSON.stringify({ text }), position: 0, sender: '00000000-0000-0000-0000-000000000000' });
  client.on('chat', p => {
    if (p.message === 'trigger-orders') {
      say('<Stranger> !mo hack the server');
      say('<BossPlayer> hello team');
      say('<BossPlayer> !mo report your status');
    }
    if (p.message === 'trigger-kick') client.end('Connection throttled! Please wait before reconnecting.');
    if (p.message === 'trigger-ban') client.end('You are banned from this server.');
  });
});

const online = mc.createServer({ 'online-mode': true, version: VERSION, port: 25598, host: '127.0.0.1', motd: 'Mock Online Server' });
online.on('login', c => log('online login?!', c.username));

http.createServer((req, res) => {
  let body = '';
  req.on('data', d => (body += d));
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    const system = parsed.messages?.find(m => m.role === 'system')?.content || '';
    const user = parsed.messages?.find(m => m.role === 'user')?.content || '';
    log('LLM call:', JSON.stringify(user).slice(0, 110));
    let content;
    if (system.includes('good enough to join')) {
      content = '{"approved":true}';
    } else if (system.includes('Plan this the way')) {
      content = JSON.stringify([
        { id: 'spec', title: 'Write the requirements', description: 'What the cafe needs', assignedRole: 'product_manager', category: 'research', checkpoint: true },
        { id: 'look', title: 'Design the look', description: 'Match the image', assignedRole: 'ui_designer', category: 'research', dependsOn: ['spec'], checkpoint: true },
        { id: 'page', title: 'Build the booking page', description: 'The page', assignedRole: 'frontend', category: 'code', dependsOn: ['look'] },
        { id: 'api', title: 'Build the booking API', description: 'The API', assignedRole: 'backend', category: 'code', dependsOn: ['spec'] },
        { id: 'test', title: 'Write tests', description: 'Tests', assignedRole: 'qa', category: 'code', dependsOn: ['page', 'api'] }
      ]);
    } else if (system.includes('Write your finished work directly')) {
      content = `Finished document for: ${user.split('\n')[0]}`;
    } else if (system.includes('Choose up to') && user.includes('Task: Build the booking')) {
      content = '[]';
    } else if (system.includes('MINEOFFICE_FILE') && /Task: (Build the booking|Write tests)/.test(user)) {
      const name = user.match(/Task: (.*)/)[1].toLowerCase().replace(/\W+/g, '-');
      content = `SUMMARY: ${name}\n<<<MINEOFFICE_FILE src/${name}.ts\nexport const done = true;\nMINEOFFICE_END>>>`;
    } else if (system.includes('Choose up to')) {
      content = '["package.json", "src/app.ts", ".env"]';
    } else if (system.includes('MINEOFFICE_FILE')) {
      codeRuns = (typeof codeRuns === 'number' ? codeRuns : 0) + 1;
      content = `SUMMARY: เพิ่มฟังก์ชันล็อกอินรอบที่ ${codeRuns}
<<<MINEOFFICE_FILE src/app.ts
export const app = 'edited ${codeRuns}';
MINEOFFICE_END>>>
<<<MINEOFFICE_FILE src/feature.ts
export const feature = ${codeRuns};
MINEOFFICE_END>>>
<<<MINEOFFICE_FILE package.json
{"name":"demo","version":"1.0.${codeRuns}"}
MINEOFFICE_END>>>`;
    } else if (system.includes('Commander of the MineOffice')) {
      content = 'Sure!\n```json\n[{"title":"Status check","description":"Report status in chat","assignedRole":"builder","priority":"high"},{"title":"Attack test","description":"tries a forbidden skill","assignedRole":"explorer","priority":"low"}]\n```';
    } else if (user.includes('Nothing yet.')) {
      // The first turn of an agent's loop
      content = user.includes('outside tool')
        ? '{"thought":"ask the outside tool","tool":"mcp__fixture__echo","args":{"text":"hello from the game"}}'
        : user.includes('forbidden')
        ? '{"thought":"try it","tool":"build-shelter","args":{}}'
        : '<think>hm [not json]</think>{"thought":"look around","tool":"say-chat","args":{"message":"/op everyone"}}';
    } else {
      content = '{"done":true,"report":"finished"}';
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: { content } }));
  });
}).listen(11599, '127.0.0.1', () => log('LLM on 11599'));

log('servers ready on 25599 (offline) and 25598 (online-mode)');
