import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { AppSettings, ServerKind } from '@shared/types';
import { parseServerAddress } from '@shared/minecraft';
import { SwarmOrchestrator } from '@main/core/foreman/orchestrator';
import { SettingsStore } from '@main/core/settings/settingsStore';
import { createDefaultSettings, stripEnvironmentKeys } from '@main/core/settings/defaults';
import { mineofficeHome } from '@main/core/runtime/paths';
import { ToolHost, ToolBackend } from '@main/core/mcp/tools';
import { runStdioMcpServer } from '@main/core/mcp/stdioServer';
import { ControlServer, connectToRunningApp, readOnlyBackend } from '@main/core/control/controlServer';
import { ViewerServer, generateViewerKey } from '@main/core/viewer/viewerServer';
import { buildPublicStatus } from '@main/core/viewer/publicSnapshot';
import { watchServer } from '@main/core/viewer/viewerClient';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION: string = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;

const HELP = `MineOffice Agent ${VERSION}

Usage: mineoffice-agent <command> [options]

Commands:
  init                 Create the config file (${path.join('~', '.mineoffice', 'settings.json')})
  serve                Run the AI team without a screen, for Linux servers
  mcp                  Run an MCP server over stdio so AI tools can control MineOffice
  watch <address>      Watch a shared server's AI team from anywhere
  status               Show the team on the app running on this machine
  viewer-key           Print the key that viewers need

serve options:
  --host <addr>        Minecraft server, may include a port (host:25566)
  --port <n>           Minecraft server port
  --mc-version <v>     Minecraft version, or "auto"
  --public             This is a public server: join slowly and do not dig while walking
  --spawn              Send all field crew into the server at start
  --commander <name>   Player who may give orders in game chat (repeatable)
  --viewer             Share the read-only status page
  --viewer-port <n>    Port for the status page (default 8787)
  --viewer-bind <ip>   Address to listen on (default 0.0.0.0)
  --viewer-open        Let anyone with the address watch, without a key
  --viewer-coords      Show bot coordinates to viewers. This reveals where bases are
  --tls-cert <file>    Serve the status page over HTTPS with this certificate
  --tls-key <file>     Private key for --tls-cert
  --allow-root         Run as root anyway. Not recommended

mcp options:
  --read-only          Only offer tools that look, never tools that act
  --standalone         Do not attach to an app already running on this machine
  --print-config       Print the config to paste into an AI tool, then exit

watch options:
  --once               Print one snapshot and exit
  Set MINEOFFICE_VIEWER_KEY to supply the key.

viewer-key options:
  --rotate             Replace the key. Everyone must use the new one after a restart

Environment:
  OPENROUTER_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, OLLAMA_BASE_URL
  MINEOFFICE_HOME      Where settings, sign-in tokens and the audit log are kept
`;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * Ends after a request has been made. Calling process.exit right after fetch crashes Node on
 * Windows while it closes the connection, so this lets the process end by itself and only
 * forces the exit if something, such as a connected bot, would keep it alive.
 */
function exitWhenIdle(code: number) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 1000).unref();
}

/** Text from a remote server must not be able to move the cursor or rewrite the terminal. */
function plain(text: unknown): string {
  return String(text ?? '').replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
}

function createEngine() {
  const home = mineofficeHome();
  const store = new SettingsStore(home);
  const settings = store.load(createDefaultSettings(process.env.MINEOFFICE_WORKSPACE || process.cwd()));
  const orchestrator = new SwarmOrchestrator(settings, path.join(home, 'minecraft-auth'));

  // The library throws "version not supported" from socket callbacks, out of reach of try/catch
  process.on('uncaughtException', err => {
    console.error('[MineOffice] Uncaught exception:', err.message);
    orchestrator.swarm.handleFatalConnectionError(err);
  });

  // Only roles are saved from here. Run-only flags given to serve must not reach the config file.
  const persist = () => store.save(stripEnvironmentKeys({ ...settings, agentRoles: orchestrator.settings.agentRoles }));
  const tools = new ToolHost(orchestrator, home, persist);
  return { home, store, settings, orchestrator, tools, persist };
}

function hasProviderKey(settings: AppSettings): boolean {
  if (settings.activeDefaultProvider === 'ollama') return true;
  return !!settings.providers[settings.activeDefaultProvider].apiKey;
}

function refuseRoot(allowRoot: boolean) {
  if (process.getuid?.() === 0 && !allowRoot) {
    fail('Refusing to run as root. Bots talk to untrusted servers, so use an ordinary user. Pass --allow-root to override.');
  }
}

function lanAddress(): string {
  for (const addresses of Object.values(os.networkInterfaces())) {
    const found = addresses?.find(a => a.family === 'IPv4' && !a.internal);
    if (found) return found.address;
  }
  return 'YOUR_SERVER_IP';
}

function runInit(force: boolean) {
  const store = new SettingsStore(mineofficeHome());
  if (store.exists() && !force) fail(`${store.filePath} already exists. Pass --force to replace it.`);

  // Keys from the environment stay in the environment rather than being copied to disk
  const clean = createDefaultSettings(process.cwd());
  Object.values<any>(clean.providers).forEach(provider => {
    if ('apiKey' in provider) provider.apiKey = '';
  });
  store.save(clean);
  store.flush();
  console.log(`Created ${store.filePath}`);
  console.log('Add an AI key to it, or set one in the environment such as OPENROUTER_API_KEY.');
}

async function runServe(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      host: { type: 'string' },
      port: { type: 'string' },
      'mc-version': { type: 'string' },
      public: { type: 'boolean', default: false },
      spawn: { type: 'boolean', default: false },
      commander: { type: 'string', multiple: true },
      viewer: { type: 'boolean', default: false },
      'viewer-port': { type: 'string' },
      'viewer-bind': { type: 'string' },
      'viewer-open': { type: 'boolean', default: false },
      'viewer-coords': { type: 'boolean', default: false },
      'tls-cert': { type: 'string' },
      'tls-key': { type: 'string' },
      'allow-root': { type: 'boolean', default: false }
    }
  });
  refuseRoot(values['allow-root']!);

  const { home, store, settings, orchestrator, tools, persist } = createEngine();

  // Flags apply to this run only, so a one-off test cannot silently change the saved setup
  const kind: ServerKind = values.public ? 'public' : settings.minecraft.kind;
  const target = { ...settings.minecraft.targets[kind] };
  if (values.host) {
    const parsed = parseServerAddress(values.host);
    target.host = parsed.host;
    if (parsed.port) target.port = parsed.port;
  }
  if (values.port) target.port = Number(values.port);
  if (values['mc-version']) target.version = values['mc-version'];

  const runtime: AppSettings = {
    ...settings,
    minecraft: {
      ...settings.minecraft,
      kind,
      targets: { ...settings.minecraft.targets, [kind]: target },
      commanders: values.commander ?? settings.minecraft.commanders
    },
    viewer: {
      ...settings.viewer,
      enabled: values.viewer! || settings.viewer.enabled,
      port: values['viewer-port'] ? Number(values['viewer-port']) : settings.viewer.port,
      bind: values['viewer-bind'] ?? settings.viewer.bind,
      requireKey: values['viewer-open'] ? false : settings.viewer.requireKey,
      showCoordinates: values['viewer-coords']! || settings.viewer.showCoordinates
    }
  };
  orchestrator.applySettings(runtime);

  orchestrator.onLog = (agentId, log) => {
    console.log(`${log.timestamp} [${agentId}] ${log.level}: ${plain(log.message)}`);
  };
  orchestrator.onAuthPrompt = (agentId, account, prompt) => {
    console.log(`\n[${agentId}] Sign in ${account}: open ${prompt.verificationUri} and enter ${prompt.userCode}\n`);
  };

  console.log(`MineOffice Agent ${VERSION}`);
  console.log(`Minecraft server: ${target.host}:${target.port} (${kind}, version ${target.version})`);
  console.log(`Data folder: ${home}`);
  if (!hasProviderKey(runtime)) {
    console.warn(`No API key for ${runtime.activeDefaultProvider}: planning and tasks will fail until one is set.`);
  }
  if (kind === 'public') {
    console.warn('Public server: many ban bots. Check the rules first, or the account may be banned.');
  }
  if (runtime.minecraft.commanders.length > 0 && runtime.minecraft.accounts.every(a => a.authMode === 'offline')) {
    console.warn('Offline accounts: on a server with no login plugin, anyone can pose as a commander by using their name.');
  }

  const control = new ControlServer(tools);
  await control.start();

  let viewer: ViewerServer | null = null;
  if (runtime.viewer.enabled) {
    if ((values['tls-cert'] && !values['tls-key']) || (!values['tls-cert'] && values['tls-key'])) {
      fail('--tls-cert and --tls-key must be used together.');
    }
    if (runtime.viewer.requireKey && !runtime.viewer.key) {
      runtime.viewer.key = generateViewerKey();
      settings.viewer = { ...settings.viewer, key: runtime.viewer.key };
      persist();
      store.flush();
    }
    viewer = new ViewerServer({
      getStatus: () => buildPublicStatus(orchestrator, runtime.viewer),
      getSettings: () => runtime.viewer,
      assetsDirectory: path.join(here, 'viewer-assets'),
      tls: values['tls-cert']
        ? { cert: fs.readFileSync(values['tls-cert']), key: fs.readFileSync(values['tls-key']!) } as any
        : undefined
    });
    try {
      await viewer.start();
    } catch (err: any) {
      fail(`Could not open the status page on port ${runtime.viewer.port}: ${err.message}`);
    }

    const scheme = values['tls-cert'] ? 'https' : 'http';
    const address = `${scheme}://${lanAddress()}:${runtime.viewer.port}/`;
    console.log(`Status page: ${address} (allow this port through your firewall)`);
    if (!runtime.viewer.requireKey) {
      console.warn('The status page is open: anyone who finds this address can watch.');
    } else if (process.stdout.isTTY) {
      console.log(`Share this link: ${address}#key=${runtime.viewer.key}`);
    } else {
      // Service logs get collected and shipped elsewhere, so a secret should not be printed to them
      console.log('Run "mineoffice-agent viewer-key" to see the key viewers need.');
    }
    if (scheme === 'http' && runtime.viewer.requireKey) {
      console.warn('Without HTTPS the key travels unencrypted. Use --tls-cert or a reverse proxy on the open internet.');
    }
  }

  if (values.spawn) orchestrator.connectAllBots();

  const shutdown = async () => {
    console.log('Shutting down...');
    control.stop();
    orchestrator.mcp.stopAll();
    orchestrator.swarm.disconnectAll();
    await viewer?.stop();
    store.flush();
    // Give the quit packets a moment to reach the server
    setTimeout(() => process.exit(0), 300);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function runMcp(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'read-only': { type: 'boolean', default: false },
      standalone: { type: 'boolean', default: false },
      'print-config': { type: 'boolean', default: false }
    }
  });

  if (values['print-config']) {
    const config = { mcpServers: { mineoffice: { command: 'npx', args: ['-y', 'mineoffice-agent', 'mcp'] } } };
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  // stdout belongs to the protocol. Anything a library prints there would break the client.
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;

  let backend: ToolBackend | null = values.standalone ? null : await connectToRunningApp();
  if (backend) {
    console.error('[MineOffice MCP] Attached to the app running on this machine.');
  } else {
    backend = createEngine().tools;
    console.error('[MineOffice MCP] No running app found, so running the engine here.');
  }
  if (values['read-only']) backend = readOnlyBackend(backend);

  await runStdioMcpServer(backend, { name: 'mineoffice', version: VERSION });
  exitWhenIdle(0);
}

function printWatch(result: Awaited<ReturnType<typeof watchServer>>) {
  switch (result.state) {
    case 'needs-key':
      console.log('This server requires a key. Set MINEOFFICE_VIEWER_KEY and try again.');
      return;
    case 'bad-key':
      console.log('That key is not correct.');
      return;
    case 'rate-limited':
      console.log('Too many requests. Waiting before trying again.');
      return;
    case 'no-viewer':
      console.log(plain(result.error));
      if (result.minecraft?.ok) {
        const mc = result.minecraft;
        console.log(`Minecraft server is up: ${plain(mc.versionName)}, players ${mc.playersOnline}/${mc.playersMax}`);
      }
      return;
    case 'ok': {
      const { status } = result;
      console.log(`${plain(status.title)}  bots online ${status.botsOnline}/${status.botsTotal}  (${new Date(status.generatedAt).toLocaleTimeString()})\n`);
      for (const agent of status.agents) {
        const state = agent.inGame && !agent.online ? 'not in game' : agent.status;
        const vitals = agent.online ? ` HP ${Math.round(agent.health ?? 0)}/20` : '';
        console.log(`  ${plain(agent.name).padEnd(10)} ${plain(agent.role).padEnd(10)} ${plain(state).padEnd(16)}${vitals}  ${plain(agent.activity)}`);
      }
      const open = status.tasks.filter(task => task.status !== 'done');
      console.log(`\nOpen tasks: ${open.length}`);
      open.forEach(task => console.log(`  [${plain(task.status)}] ${plain(task.title)} (${plain(task.assignee)})`));
    }
  }
}

async function runWatch(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { once: { type: 'boolean', default: false } }
  });
  const address = positionals[0];
  if (!address) fail('Give the server address, for example: mineoffice-agent watch 203.0.113.5');

  // Taken from the environment because command-line arguments are visible to other users
  const key = process.env.MINEOFFICE_VIEWER_KEY;

  const tick = async () => {
    const result = await watchServer(address, key);
    if (!values.once && process.stdout.isTTY) console.clear();
    printWatch(result);
    return result;
  };

  const first = await tick();
  if (values.once) {
    exitWhenIdle(first.state === 'ok' ? 0 : 1);
    return;
  }
  setInterval(tick, first.state === 'rate-limited' ? 30000 : 2000);
}

async function runStatus() {
  const backend = await connectToRunningApp();
  if (!backend) fail('No MineOffice app or server is running on this machine.');
  console.log(JSON.stringify(await backend.call('mineoffice_get_state', {}), null, 2));
}

function runViewerKey(argv: string[]) {
  const { values } = parseArgs({ args: argv, options: { rotate: { type: 'boolean', default: false } } });
  const store = new SettingsStore(mineofficeHome());
  const settings = store.load(createDefaultSettings(process.cwd()));
  if (values.rotate || !settings.viewer.key) {
    settings.viewer.key = generateViewerKey();
    store.save(stripEnvironmentKeys(settings));
    store.flush();
  }
  console.log(settings.viewer.key);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'init':
      return runInit(rest.includes('--force'));
    case 'serve':
      return runServe(rest);
    case 'mcp':
      return runMcp(rest);
    case 'watch':
      return runWatch(rest);
    case 'status':
      return runStatus();
    case 'viewer-key':
      return runViewerKey(rest);
    case '--version':
    case '-v':
      console.log(VERSION);
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return;
    default:
      fail(`Unknown command "${command}". Run mineoffice-agent --help.`);
  }
}

main().catch(err => fail(err?.message || String(err)));
