import React, { useEffect, useRef, useState } from 'react';
import { PublicStatus, ViewerSettings, WatchResult } from '@shared/types';
import { ROLE_DEFINITIONS, roleName } from '@shared/roles';
import { t } from '@shared/i18n';
import { Lamp, PixelIcon, Portrait, taskLabel } from '../components/ui';

const POLL_MS = 2000;
const RATE_LIMITED_POLL_MS = 30000;

const RemoteTeam: React.FC<{ status: PublicStatus }> = ({ status }) => (
  <div className="flex flex-col gap-4">
    <p className="text-sm text-muted">
      {t('watch.botsOnline', { title: status.title, online: status.botsOnline, total: status.botsTotal })}
    </p>
    <div className="grid grid-cols-2 gap-3">
      {status.agents.map(agent => {
        const role = ROLE_DEFINITIONS[agent.role];
        return (
          <div key={agent.id} className={`flex gap-3 p-3 rounded-xl min-w-0 border ${agent.role === 'commander' ? 'bg-lantern-tint border-lantern' : 'bg-white border-line-strong'}`}>
            <Portrait agentId={agent.id} size={48} />
            <div className="min-w-0 flex flex-col gap-0.5 text-[13px]">
              <span className="text-[15px] font-bold">{agent.name}</span>
              <span className="flex items-center gap-1.5 text-muted">
                {role && <PixelIcon src={role.icon} size={14} />}
                {roleName(agent.role)}
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <Lamp kind={agent.inGame && !agent.online ? 'off' : agent.status === 'working' || agent.status === 'planning' ? 'work' : 'ok'} />
                {agent.inGame && !agent.online ? t('agent.notInGame') : agent.status === 'working' ? t('agent.working') : agent.online ? t('watch.inGame') : t('watch.ready')}
              </span>
              {agent.online && <span className="text-muted">{t('watch.health', { health: Math.round(agent.health ?? 0) })}</span>}
              {agent.position && <span className="font-mono text-muted">{agent.position.x}, {agent.position.y}, {agent.position.z}</span>}
              {agent.activity && <span className="text-muted break-words">{agent.activity}</span>}
            </div>
          </div>
        );
      })}
    </div>
    <div className="flex flex-col gap-2">
      <h3 className="text-[15px]">{t('watch.tasks')}</h3>
      {status.tasks.length === 0 && <p className="text-sm text-muted">{t('watch.noTasks')}</p>}
      {status.tasks.slice().reverse().map(task => (
        <div key={task.id} className="flex justify-between gap-3 px-3 py-2.5 bg-white border border-line rounded-lg text-sm">
          <span className="min-w-0 break-words">{task.title}</span>
          <span className="shrink-0 text-[13px] text-muted">
            {task.assignee ? `${task.assignee} · ` : ''}
            {taskLabel(task.status)}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const WatchRemote: React.FC = () => {
  const [address, setAddress] = useState('');
  const [key, setKey] = useState('');
  const [watching, setWatching] = useState(false);
  const [result, setResult] = useState<WatchResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!watching) return;
    let stopped = false;

    const poll = async () => {
      const next: WatchResult = await window.electronAPI.watchServer(address, key || undefined);
      if (stopped) return;
      setResult(next);
      if (next.state === 'ok' || next.state === 'rate-limited') {
        timer.current = setTimeout(poll, next.state === 'ok' ? POLL_MS : RATE_LIMITED_POLL_MS);
      } else {
        // A wrong key must not keep retrying, or it would use up the server's lockout allowance
        setWatching(false);
      }
    };
    poll();

    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [watching]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) setWatching(!watching);
  };

  return (
    <section aria-labelledby="watch-remote" className="card flex-[3_1_520px] min-w-0 p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="watch-remote" className="text-lg">{t('watch.remoteTitle')}</h2>
        <p className="text-sm leading-relaxed text-muted">{t('watch.remoteBody')}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-[2_1_200px] min-w-0 flex flex-col gap-1.5">
          <label htmlFor="watch-address" className="text-sm font-medium">{t('watch.addressLabel')}</label>
          <input id="watch-address" className="field font-mono" value={address} disabled={watching} onChange={e => setAddress(e.target.value)} placeholder="203.0.113.5" />
        </div>
        <div className="flex-[1_1_130px] min-w-0 flex flex-col gap-1.5">
          <label htmlFor="watch-key" className="text-sm font-medium">{t('watch.keyLabel')}</label>
          <input id="watch-key" className="field" type="password" autoComplete="off" value={key} disabled={watching} onChange={e => setKey(e.target.value)} />
        </div>
        <button type="submit" className={`btn ${watching ? 'btn-ghost' : 'btn-primary'}`}>{watching ? t('watch.stop') : t('watch.start')}</button>
      </form>

      {result?.state === 'ok' && <RemoteTeam status={result.status} />}
      {result?.state === 'needs-key' && <p className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm text-lantern-deep">{t('watch.needsKey')}</p>}
      {result?.state === 'bad-key' && <p role="alert" className="px-3.5 py-3 rounded-lg bg-bad-tint border border-bad-edge text-sm text-bad">{t('watch.badKey')}</p>}
      {result?.state === 'rate-limited' && <p className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm text-lantern-deep">{t('watch.rateLimited')}</p>}
      {result?.state === 'no-viewer' && (
        <div className="flex flex-col gap-2 text-sm">
          <p role="alert" className="px-3.5 py-3 rounded-lg bg-bad-tint border border-bad-edge text-bad break-words">{result.error}</p>
          {result.minecraft?.ok && (
            <p className="flex flex-wrap items-center gap-2 px-3.5 py-3 rounded-lg bg-good-tint border border-good-edge">
              <Lamp kind="ok" />
              {t('watch.mcUp', { version: result.minecraft.versionName ?? '', online: result.minecraft.playersOnline ?? 0, max: result.minecraft.playersMax ?? 0 })}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

interface ViewerState {
  settings: ViewerSettings;
  running: boolean;
  addresses: string[];
  error?: string;
}

const ShareMine: React.FC = () => {
  const [state, setState] = useState<ViewerState | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    window.electronAPI?.getViewerState().then(setState);
  }, []);

  if (!state) return null;
  const { settings: viewer, running, addresses, error } = state;

  const update = async (patch: Partial<ViewerSettings>) => {
    setState(await window.electronAPI.saveViewerSettings({ ...viewer, ...patch }));
  };

  const base = `http://${addresses[0] || 'YOUR_IP'}:${viewer.port}/`;
  const link = viewer.requireKey ? `${base}#key=${viewer.key}` : base;

  return (
    <section aria-labelledby="share-mine" className="card flex-[2_1_300px] min-w-0 p-6 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="share-mine" className="text-lg">{t('watch.shareTitle')}</h2>
        <p className="text-sm leading-relaxed text-muted">{t('watch.shareBody')}</p>
      </div>

      <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm font-medium">
        <span className="flex items-center gap-2">
          <Lamp kind={running ? 'ok' : 'off'} />
          {running ? t('watch.sharing', { port: viewer.port }) : t('watch.notSharing')}
        </span>
        <input type="checkbox" className="w-5 h-5 shrink-0 accent-brand" checked={viewer.enabled} onChange={e => update({ enabled: e.target.checked })} />
      </label>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm">
        <span>{t('watch.requireKey')}</span>
        <input type="checkbox" className="w-5 h-5 shrink-0 accent-brand" checked={viewer.requireKey} onChange={e => update({ requireKey: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm">
        <span>{t('watch.showCoords')}</span>
        <input type="checkbox" className="w-5 h-5 shrink-0 accent-brand" checked={viewer.showCoordinates} onChange={e => update({ showCoordinates: e.target.checked })} />
      </label>

      {running && (
        <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-panel">
          <p className="text-sm font-semibold">{t('watch.link')}</p>
          <code className="font-mono text-[13px] break-all select-text">{showKey || !viewer.requireKey ? link : base}</code>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigator.clipboard.writeText(link)} className="btn btn-primary">{t('watch.copy')}</button>
            {viewer.requireKey && (
              <>
                <button onClick={() => setShowKey(!showKey)} className="btn btn-ghost">{showKey ? t('watch.hideKey') : t('watch.showKey')}</button>
                <button onClick={async () => setState(await window.electronAPI.rotateViewerKey())} className="btn btn-ghost">{t('watch.rotateKey')}</button>
              </>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            {t('watch.firewall', { port: viewer.port })}
          </p>
        </div>
      )}
    </section>
  );
};

export const Watch: React.FC = () => (
  <div className="flex flex-col gap-6">
    <header className="flex flex-col gap-1">
      <h1 className="page-title">{t('watch.title')}</h1>
      <p className="text-[15px] text-muted">{t('watch.subtitle')}</p>
    </header>
    <div className="flex flex-wrap items-start gap-6">
      <WatchRemote />
      <ShareMine />
    </div>
  </div>
);
