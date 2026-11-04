import { AgentRole, AgentStatus, PublicEventKind, PublicStatus, ServerTarget, TaskCategory, TaskStatus, WatchResult } from '@shared/types';
import { DEFAULT_MC_PORT } from '@shared/minecraft';
import { t } from '@shared/i18n';
import { pingServer } from '../bot/mineflayerSwarm';
import { DEFAULT_VIEWER_PORT } from '../settings/defaults';

const REQUEST_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

function parseViewerAddress(address: string): { base: string; host: string } | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    if (url.username || url.password) return null;
    const port = url.port || (url.protocol === 'https:' ? '443' : String(DEFAULT_VIEWER_PORT));
    return { base: `${url.protocol}//${url.hostname}:${port}`, host: url.hostname };
  } catch {
    return null;
  }
}

async function getJson(url: string, key?: string): Promise<{ status: number; body: any }> {
  const response = await fetch(url, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    // A redirect could carry the key to a host the user never named
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('Response is too large.');
  return { status: response.status, body: JSON.parse(text) };
}

const text = (value: unknown, max = 200) => String(value ?? '').slice(0, max);
const optionalNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const list = (value: unknown, max: number): any[] => (Array.isArray(value) ? value.slice(0, max) : []);

/** The remote side may be anything that answered on that port, so nothing it sends is trusted. */
function normalizeStatus(body: any): PublicStatus {
  return {
    title: text(body?.title, 80) || 'MineOffice',
    generatedAt: text(body?.generatedAt, 40),
    botsOnline: optionalNumber(body?.botsOnline) ?? 0,
    botsTotal: optionalNumber(body?.botsTotal) ?? 0,
    agents: list(body?.agents, 50).map(agent => ({
      id: text(agent?.id, 40),
      name: text(agent?.name, 40),
      role: text(agent?.role, 20) as AgentRole,
      status: text(agent?.status, 20) as AgentStatus,
      activity: agent?.activity ? text(agent.activity) : undefined,
      inGame: !!agent?.inGame,
      online: !!agent?.online,
      health: optionalNumber(agent?.health),
      food: optionalNumber(agent?.food),
      position: agent?.position
        ? { x: Number(agent.position.x) || 0, y: Number(agent.position.y) || 0, z: Number(agent.position.z) || 0 }
        : undefined
    })),
    tasks: list(body?.tasks, 100).map(task => ({
      id: text(task?.id, 40),
      title: text(task?.title),
      status: text(task?.status, 20) as TaskStatus,
      category: text(task?.category, 20) as TaskCategory,
      assignee: task?.assignee ? text(task.assignee, 40) : undefined
    })),
    events: list(body?.events, 50).map(event => ({
      time: text(event?.time, 40),
      agent: event?.agent ? text(event.agent, 40) : undefined,
      kind: text(event?.kind, 20) as PublicEventKind,
      detail: event?.detail ? text(event.detail) : undefined
    }))
  };
}

/**
 * Looks at a server from outside. A plain Minecraft server knows nothing about the AI team,
 * so when no MineOffice viewer answers, this falls back to the public Minecraft ping.
 */
export async function watchServer(address: string, key?: string): Promise<WatchResult> {
  const parsed = parseViewerAddress(address);
  if (!parsed) return { state: 'no-viewer', error: t('watch.badAddress') };

  try {
    const info = await getJson(`${parsed.base}/api/info`);
    if (info.body?.app !== 'mineoffice-viewer') throw new Error('Not a MineOffice viewer');

    const { status, body } = await getJson(`${parsed.base}/api/status`, key);
    if (status === 200) return { state: 'ok', status: normalizeStatus(body) };
    if (status === 429) return { state: 'rate-limited' };
    return { state: body?.error === 'bad-key' ? 'bad-key' : 'needs-key' };
  } catch {
    const target: ServerTarget = { host: parsed.host, port: DEFAULT_MC_PORT, version: 'auto', postJoinCommands: [] };
    return {
      state: 'no-viewer',
      error: t('watch.noViewer', { base: parsed.base }),
      minecraft: await pingServer(target)
    };
  }
}
