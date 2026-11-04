import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import { AddressInfo } from 'net';
import { ToolBackend, ToolDefinition } from '../mcp/tools';
import { controlFilePath, writePrivateFile } from '../runtime/paths';

const MAX_BODY_BYTES = 256 * 1024;

interface ControlFile {
  port: number;
  token: string;
  pid: number;
}

function tokensMatch(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Lets the MCP bridge drive a running app. It can never be reached from another machine:
 * it binds to loopback only and needs a token from a file only this user can read.
 * Host and Origin are checked as well, so a web page open in a browser cannot reach it
 * through DNS rebinding even though the browser runs on this same machine.
 */
export class ControlServer {
  private backend: ToolBackend;
  private server: http.Server | null = null;
  private token = crypto.randomBytes(32).toString('base64url');

  constructor(backend: ToolBackend) {
    this.backend = backend;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.requestTimeout = 60 * 1000;
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        this.server = server;
        const { port } = server.address() as AddressInfo;
        const file: ControlFile = { port, token: this.token, pid: process.pid };
        writePrivateFile(controlFilePath(), JSON.stringify(file));
        resolve(port);
      });
    });
  }

  public stop() {
    this.server?.close();
    this.server = null;
    try {
      const file: ControlFile = JSON.parse(fs.readFileSync(controlFilePath(), 'utf8'));
      if (file.pid === process.pid) fs.rmSync(controlFilePath(), { force: true });
    } catch {
      // Nothing to clean up
    }
  }

  private reply(res: http.ServerResponse, status: number, body: Record<string, any>) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const { port } = this.server!.address() as AddressInfo;
    const hostAllowed = req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
    if (!hostAllowed || req.headers.origin) return this.reply(res, 403, { error: 'Forbidden' });

    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || !tokensMatch(auth.slice(7), this.token)) {
      return this.reply(res, 401, { error: 'Unauthorized' });
    }
    if (req.method !== 'POST') return this.reply(res, 405, { error: 'Method not allowed' });
    if (!req.headers['content-type']?.startsWith('application/json')) {
      return this.reply(res, 415, { error: 'JSON required' });
    }

    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        this.reply(res, 413, { error: 'Too large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (req.url === '/tools/list') {
          this.reply(res, 200, { result: await this.backend.list() });
        } else if (req.url === '/tools/call') {
          this.reply(res, 200, { result: await this.backend.call(body.name, body.arguments || {}) });
        } else {
          this.reply(res, 404, { error: 'Not found' });
        }
      } catch (err: any) {
        this.reply(res, 400, { error: err?.message || 'Bad request' });
      }
    });
  }
}

/** Connects to a running app, or returns null if none is running. */
export async function connectToRunningApp(): Promise<ToolBackend | null> {
  let file: ControlFile;
  try {
    file = JSON.parse(fs.readFileSync(controlFilePath(), 'utf8'));
    process.kill(file.pid, 0); // Throws if that process is gone and the file is stale
  } catch {
    return null;
  }

  const post = async (route: string, body: Record<string, any>) => {
    const response = await fetch(`http://127.0.0.1:${file.port}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${file.token}` },
      body: JSON.stringify(body),
      redirect: 'error'
    });
    const data: any = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data.result;
  };

  const backend: ToolBackend = {
    list: () => post('/tools/list', {}) as Promise<ToolDefinition[]>,
    call: (name, args) => post('/tools/call', { name, arguments: args })
  };

  try {
    await backend.list();
    return backend;
  } catch {
    return null;
  }
}

/** Hides control tools from an AI client the user only trusts to look. */
export function readOnlyBackend(backend: ToolBackend): ToolBackend {
  return {
    list: async () => (await backend.list()).filter(tool => tool.readOnly),
    call: async (name, args) => {
      const tool = (await backend.list()).find(t => t.name === name);
      if (!tool?.readOnly) throw new Error(`"${name}" is not available in read-only mode.`);
      return backend.call(name, args);
    }
  };
}
