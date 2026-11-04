import { ChildProcess, spawn } from 'child_process';
import readline from 'readline';
import { McpServerConfig, McpServerStatus, PermissionAction } from '@shared/types';

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_TIMEOUT_MS = 30 * 1000;
const MAX_RESULT_CHARS = 20 * 1024;
const MAX_TOOLS_PER_SERVER = 100;

export interface McpTool {
  /** Prefixed with the server's name, so two servers can never clash. */
  name: string;
  server: string;
  description: string;
  inputSchema: unknown;
  permission: PermissionAction;
}

interface Connection {
  request(method: string, params?: unknown): Promise<any>;
  notify(method: string, params?: unknown): void;
  close(): void;
}

/** Keys in this process's environment must not reach third-party programs by default. */
function childEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!/(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)) safe[name] = value;
  }
  return { ...safe, ...extra };
}

function connectStdio(config: Extract<McpServerConfig, { type: 'local' }>, timeoutMs: number): Connection {
  const [command, ...args] = config.command;
  // No shell, so nothing in a config value can be interpreted as a command. On Windows, npx and
  // other .cmd launchers can only be started through cmd.exe, which Node will not do by itself.
  const isWindowsScript = process.platform === 'win32' && !/\.(exe|com)$/i.test(command) && command !== 'node';
  const child: ChildProcess = isWindowsScript
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[command, ...args].map(part => `"${part.replace(/"/g, '""')}"`).join(' ')}"`], {
        cwd: config.cwd,
        env: childEnvironment(config.environment),
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true,
        windowsVerbatimArguments: true
      })
    : spawn(command, args, {
        cwd: config.cwd,
        env: childEnvironment(config.environment),
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      });

  const pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }>();
  let nextId = 1;
  let exitError: Error | null = null;

  const failAll = (err: Error) => {
    exitError = err;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    pending.clear();
  };
  child.on('error', err => failAll(err));
  child.on('exit', code => failAll(new Error(`The server stopped (exit code ${code}).`)));
  // Writing to a server that just died must fail the request, not crash the app
  child.stdin?.on('error', () => {});

  readline.createInterface({ input: child.stdout!, crlfDelay: Infinity }).on('line', line => {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return; // Some servers print logs to stdout. Nothing useful can be done with them.
    }
    if (message.method && message.id !== undefined) {
      // A request from the server, such as sampling, which would let it spend your AI credits
      child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not supported' } })}\n`);
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message || 'The server returned an error.'));
    else entry.resolve(message.result);
  });

  return {
    request: (method, params) =>
      new Promise((resolve, reject) => {
        if (exitError) return reject(exitError);
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`The server did not answer ${method} in time.`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      }),
    notify: (method, params) => {
      child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    close: () => {
      child.stdin?.end();
      child.kill();
    }
  };
}

/** Reads the JSON-RPC response with this id out of a Server-Sent Events stream. */
function findInEventStream(text: string, id: number): any {
  for (const event of text.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .join('\n');
    if (!data) continue;
    try {
      const message = JSON.parse(data);
      if (message.id === id) return message;
    } catch {
      // Not JSON, such as a keep-alive
    }
  }
  return undefined;
}

function connectHttp(config: Extract<McpServerConfig, { type: 'remote' }>, timeoutMs: number): Connection {
  let nextId = 1;
  let sessionId: string | undefined;
  let negotiated: string | undefined;

  const post = async (body: Record<string, unknown>) => {
    const headers: Record<string, string> = {
      ...config.headers,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    if (negotiated) headers['MCP-Protocol-Version'] = negotiated;
    return fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', ...body }),
      // A redirect could carry auth headers to a host the user never named
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    });
  };

  return {
    request: async (method, params) => {
      const id = nextId++;
      const response = await post({ id, method, params });
      if (!response.ok) throw new Error(`The server answered ${method} with HTTP ${response.status}.`);

      const session = response.headers.get('mcp-session-id');
      if (session) sessionId = session;

      const text = await response.text();
      const isStream = (response.headers.get('content-type') || '').includes('text/event-stream');
      const message = isStream ? findInEventStream(text, id) : JSON.parse(text);
      if (!message) throw new Error(`The server sent no answer to ${method}.`);
      if (message.error) throw new Error(message.error.message || 'The server returned an error.');
      if (method === 'initialize') negotiated = message.result?.protocolVersion;
      return message.result;
    },
    notify: (method, params) => {
      post({ method, params }).catch(() => {});
    },
    close: () => {
      if (!sessionId) return;
      fetch(config.url, { method: 'DELETE', headers: { ...config.headers, 'Mcp-Session-Id': sessionId } }).catch(() => {});
    }
  };
}

/** Pulls readable text out of a tool result. What it says is another program's words, not instructions. */
function resultText(result: any): string {
  const parts = Array.isArray(result?.content) ? result.content : [];
  const text = parts
    .map((part: any) => (part?.type === 'text' ? part.text : `[${part?.type || 'unknown'} content]`))
    .join('\n');
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n[cut off]` : text;
}

interface ActiveServer {
  config: McpServerConfig;
  connection: Connection;
  tools: McpTool[];
  timeoutMs: number;
}

/** Connects MineOffice to outside MCP servers, so agents can use the tools those servers offer. */
export class McpClientManager {
  private servers: Map<string, ActiveServer> = new Map();
  private statuses: Map<string, McpServerStatus> = new Map();
  private configs: Record<string, McpServerConfig> = {};
  public onChange?: () => void;

  /** Connects, disconnects or reconnects so the running servers match the settings. */
  public async sync(configs: Record<string, McpServerConfig>) {
    const previous = this.configs;
    this.configs = configs;

    for (const name of Object.keys(previous)) {
      if (!configs[name] || JSON.stringify(configs[name]) !== JSON.stringify(previous[name])) this.disconnect(name);
    }
    for (const name of Array.from(this.statuses.keys())) {
      if (!configs[name]) this.statuses.delete(name);
    }

    await Promise.all(
      Object.entries(configs).map(async ([name, config]) => {
        if (!config.enabled) {
          this.statuses.set(name, { name, state: 'disabled', tools: 0 });
        } else if (!this.servers.has(name) && this.statuses.get(name)?.state !== 'connecting') {
          await this.connect(name, config);
        }
      })
    );
    this.onChange?.();
  }

  private async connect(name: string, config: McpServerConfig) {
    this.statuses.set(name, { name, state: 'connecting', tools: 0 });
    this.onChange?.();

    const timeoutMs = config.timeout || DEFAULT_TIMEOUT_MS;
    let connection: Connection | undefined;
    try {
      connection = config.type === 'local' ? connectStdio(config, timeoutMs) : connectHttp(config, timeoutMs);
      await connection.request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'mineoffice', version: '0.1.0' }
      });
      connection.notify('notifications/initialized');

      const listed = await connection.request('tools/list');
      const tools: McpTool[] = (Array.isArray(listed?.tools) ? listed.tools : []).slice(0, MAX_TOOLS_PER_SERVER).map((tool: any) => ({
        name: `mcp__${name}__${tool.name}`,
        server: name,
        description: String(tool.description || '').slice(0, 500),
        inputSchema: tool.inputSchema,
        permission: config.permission
      }));

      // The settings changed while this was connecting, so this connection is out of date
      if (JSON.stringify(this.configs[name]) !== JSON.stringify(config)) {
        connection.close();
        return;
      }

      this.servers.set(name, { config, connection, tools, timeoutMs });
      this.statuses.set(name, { name, state: 'connected', tools: tools.length });
    } catch (err: any) {
      connection?.close();
      this.statuses.set(name, { name, state: 'failed', tools: 0, error: err?.message || String(err) });
    }
    this.onChange?.();
  }

  private disconnect(name: string) {
    this.servers.get(name)?.connection.close();
    this.servers.delete(name);
    this.statuses.delete(name);
  }

  public stopAll() {
    for (const name of Array.from(this.servers.keys())) this.disconnect(name);
  }

  public getStatuses(): McpServerStatus[] {
    return Array.from(this.statuses.values());
  }

  public getTools(): McpTool[] {
    return Array.from(this.servers.values()).flatMap(server => server.tools);
  }

  public async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.getTools().find(candidate => candidate.name === toolName);
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);

    const call = () =>
      this.servers.get(tool.server)!.connection.request('tools/call', {
        name: toolName.slice(`mcp__${tool.server}__`.length),
        arguments: args
      });

    let result: any;
    try {
      result = await call();
    } catch (err: any) {
      // A remote server answers 404 when its session has expired. The spec says to start a new one.
      const config = this.configs[tool.server];
      if (config?.type !== 'remote' || !/HTTP 404/.test(err?.message)) throw err;
      this.servers.get(tool.server)?.connection.close();
      this.servers.delete(tool.server);
      await this.connect(tool.server, config);
      if (!this.servers.has(tool.server)) throw err;
      result = await call();
    }
    const text = resultText(result);
    if (result?.isError) throw new Error(text || 'The tool reported an error.');
    return text;
  }
}
