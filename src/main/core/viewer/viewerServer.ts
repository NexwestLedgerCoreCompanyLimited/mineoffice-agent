import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { PublicStatus, ViewerSettings } from '@shared/types';
import { VIEWER_CSS, VIEWER_HTML, VIEWER_JS } from './viewerPage';

const REQUESTS_PER_MINUTE = 120;
const BAD_KEYS_BEFORE_LOCKOUT = 10;
const BAD_KEY_WINDOW_MS = 5 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10000;
const STATUS_CACHE_MS = 1000;

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

// Only these images can ever be served, whatever path a request asks for
const AGENT_IDS = ['marlow', 'juniper', 'wren', 'kit', 'rowan', 'tove'];
const ROLE_IDS = ['commander', 'builder', 'miner', 'defender', 'explorer', 'coder'];
const ASSETS = new Map<string, string>([
  ['/assets/logo.png', 'icons/logo_small.png'],
  ...AGENT_IDS.map((id): [string, string] => [`/assets/${id}.png`, `portraits/${id}.png`]),
  ...ROLE_IDS.map((id): [string, string] => [`/assets/role_${id}.png`, `icons/role_${id}.png`])
]);

interface ClientRecord {
  windowStart: number;
  requests: number;
  badKeys: number;
  badKeyWindowStart: number;
}

export interface ViewerServerOptions {
  getStatus: () => PublicStatus;
  getSettings: () => ViewerSettings;
  assetsDirectory: string;
  tls?: { cert: string; key: string };
}

function keysMatch(given: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function generateViewerKey(): string {
  return crypto.randomBytes(18).toString('base64url');
}

/**
 * The read-only status page. It has no way to change anything: only GET is accepted, there is
 * no route that reaches the engine except the allowlisted snapshot, and it reads nothing from
 * a request other than the path and the key. So the worst outcome of a bug here is
 * a wrong page, not control of the bots.
 */
export class ViewerServer {
  private options: ViewerServerOptions;
  private server: http.Server | https.Server | null = null;
  private clients: Map<string, ClientRecord> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cachedStatus: { json: string; at: number } | null = null;

  constructor(options: ViewerServerOptions) {
    this.options = options;
  }

  public get running(): boolean {
    return !!this.server;
  }

  public start(): Promise<void> {
    const settings = this.options.getSettings();
    return new Promise((resolve, reject) => {
      const handler = (req: http.IncomingMessage, res: http.ServerResponse) => this.handle(req, res);
      const server = this.options.tls ? https.createServer(this.options.tls, handler) : http.createServer(handler);

      // Slow or idle clients must not be able to hold connections open
      server.requestTimeout = 10 * 1000;
      server.headersTimeout = 5 * 1000;
      server.keepAliveTimeout = 5 * 1000;
      server.maxConnections = 256;

      server.once('error', reject);
      server.listen(settings.port, settings.bind, () => {
        server.off('error', reject);
        server.on('error', err => console.error('[Viewer] Server error:', err));
        this.server = server;
        this.cleanupTimer = setInterval(() => this.forgetOldClients(), 60 * 1000);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    const server = this.server;
    this.server = null;
    if (!server) return Promise.resolve();
    return new Promise(resolve => {
      server.close(() => resolve());
      (server as http.Server).closeAllConnections?.();
    });
  }

  private forgetOldClients() {
    const now = Date.now();
    for (const [ip, client] of this.clients) {
      if (now - client.windowStart > 60 * 1000 && now - client.badKeyWindowStart > BAD_KEY_WINDOW_MS) {
        this.clients.delete(ip);
      }
    }
  }

  private clientFor(ip: string): ClientRecord {
    let client = this.clients.get(ip);
    if (!client) {
      if (this.clients.size >= MAX_TRACKED_CLIENTS) this.clients.clear();
      client = { windowStart: Date.now(), requests: 0, badKeys: 0, badKeyWindowStart: 0 };
      this.clients.set(ip, client);
    }
    return client;
  }

  private send(res: http.ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}) {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, ...extra });
    res.end(body);
  }

  private sendJson(res: http.ServerResponse, status: number, body: Record<string, any>, extra: Record<string, string> = {}) {
    this.send(res, status, 'application/json; charset=utf-8', JSON.stringify(body), extra);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const now = Date.now();
    const client = this.clientFor(req.socket.remoteAddress || 'unknown');

    if (now - client.windowStart > 60 * 1000) {
      client.windowStart = now;
      client.requests = 0;
    }
    client.requests++;
    if (client.requests > REQUESTS_PER_MINUTE) {
      return this.sendJson(res, 429, { error: 'rate-limited' }, { 'Retry-After': '30' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return this.sendJson(res, 405, { error: 'method-not-allowed' }, { Allow: 'GET, HEAD' });
    }

    const route = (req.url || '/').split('?')[0];
    switch (route) {
      case '/':
        return this.send(res, 200, 'text/html; charset=utf-8', VIEWER_HTML);
      case '/viewer.js':
        return this.send(res, 200, 'text/javascript; charset=utf-8', VIEWER_JS);
      case '/viewer.css':
        return this.send(res, 200, 'text/css; charset=utf-8', VIEWER_CSS);
      case '/api/info':
        // Lets a client tell a MineOffice viewer from some other service on this port
        return this.sendJson(res, 200, { app: 'mineoffice-viewer', requiresKey: this.options.getSettings().requireKey });
      case '/api/status':
        return this.handleStatus(req, res, client, now);
      default:
        return this.handleAsset(res, route);
    }
  }

  private handleAsset(res: http.ServerResponse, route: string) {
    const relative = ASSETS.get(route);
    if (!relative) return this.sendJson(res, 404, { error: 'not-found' });
    fs.readFile(path.join(this.options.assetsDirectory, relative), (err, data) => {
      if (err) return this.sendJson(res, 404, { error: 'not-found' });
      this.send(res, 200, 'image/png', data, { 'Cache-Control': 'public, max-age=3600' });
    });
  }

  private handleStatus(req: http.IncomingMessage, res: http.ServerResponse, client: ClientRecord, now: number) {
    const settings = this.options.getSettings();

    if (settings.requireKey) {
      if (now - client.badKeyWindowStart > BAD_KEY_WINDOW_MS) {
        client.badKeys = 0;
        client.badKeyWindowStart = now;
      }
      // Checked before the key itself so a locked-out client cannot keep guessing
      if (client.badKeys >= BAD_KEYS_BEFORE_LOCKOUT) {
        return this.sendJson(res, 429, { error: 'too-many-bad-keys' }, { 'Retry-After': '300' });
      }

      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Bearer ')) return this.sendJson(res, 401, { error: 'key-required' });

      // An empty configured key must never match an empty guess
      if (!settings.key || !keysMatch(auth.slice(7), settings.key)) {
        client.badKeys++;
        return this.sendJson(res, 401, { error: 'bad-key' });
      }
    }

    // Many viewers polling should not mean rebuilding the snapshot for each of them
    if (!this.cachedStatus || now - this.cachedStatus.at > STATUS_CACHE_MS) {
      this.cachedStatus = { json: JSON.stringify(this.options.getStatus()), at: now };
    }
    this.send(res, 200, 'application/json; charset=utf-8', this.cachedStatus.json);
  }
}
