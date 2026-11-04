import React, { useEffect, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Agent, AuthMode, BotAccount, BotRuntimeState, ServerKind, ServerTarget, ServerTestResult } from '@shared/types';
import { ROLE_DEFINITIONS, roleName, joinsWorld } from '@shared/roles';
import { t, tDynamic } from '@shared/i18n';
import { DEFAULT_MC_PORT, MC_VERSION_OPTIONS, parseServerAddress } from '@shared/minecraft';
import { Globe, Monitor, Send, X } from 'lucide-react';
import { firstName, Lamp, LampKind, PixelIcon, Portrait } from '../components/ui';

const STATUS_LAMPS: Record<BotRuntimeState['status'], LampKind> = {
  queued: 'work',
  authenticating: 'work',
  connecting: 'work',
  online: 'ok',
  reconnecting: 'work',
  offline: 'off'
};

const addressOf = (target: ServerTarget) => (target.host ? `${target.host}:${target.port}` : '');

const StepHeading: React.FC<{ number: number; id: string; children: React.ReactNode }> = ({ number, id, children }) => (
  <div className="flex items-center gap-2.5">
    <span className="step-number" aria-hidden="true">{number}</span>
    <h2 id={id} className="text-lg">{children}</h2>
  </div>
);

const ServerSteps: React.FC<{ locked: boolean }> = ({ locked }) => {
  const { settings, saveMinecraft, testServer } = useAppStore();
  const minecraft = settings.minecraft;
  const target = minecraft.targets[minecraft.kind];
  const [address, setAddress] = useState(addressOf(target));
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ServerTestResult | null>(null);
  const [advanced, setAdvanced] = useState(target.postJoinCommands.length > 0);

  useEffect(() => {
    setAddress(addressOf(minecraft.targets[minecraft.kind]));
    setResult(null);
  }, [minecraft.kind]);

  const updateTarget = (patch: Partial<ServerTarget>) => {
    setResult(null);
    saveMinecraft({ ...minecraft, targets: { ...minecraft.targets, [minecraft.kind]: { ...target, ...patch } } });
  };

  const handleAddress = (value: string) => {
    setAddress(value);
    const { host, port } = parseServerAddress(value);
    updateTarget({ host, port: port ?? DEFAULT_MC_PORT });
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(await testServer(target));
    setTesting(false);
  };

  const kinds: { id: ServerKind; title: string; detail: string; icon: React.ReactNode }[] = [
    { id: 'local', title: t('server.local'), detail: t('server.localDetail'), icon: <Monitor className="w-7 h-7 text-brand" /> },
    { id: 'public', title: t('server.public'), detail: t('server.publicDetail'), icon: <Globe className="w-7 h-7 text-brand" /> }
  ];

  return (
    <>
      <section aria-labelledby="step-where" className="card p-6 flex flex-col gap-4">
        <StepHeading number={1} id="step-where">{t('server.step1')}</StepHeading>
        <div className="grid grid-cols-2 gap-3">
          {kinds.map(kind => (
            <button
              key={kind.id}
              disabled={locked}
              onClick={() => saveMinecraft({ ...minecraft, kind: kind.id })}
              className={`choice flex-col !gap-1.5 ${minecraft.kind === kind.id ? 'on' : ''}`}
            >
              {kind.icon}
              <span className="text-base font-bold">{kind.title}</span>
              <span className="text-sm leading-normal text-muted">{kind.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="step-address" className="card p-6 flex flex-col gap-3.5">
        <StepHeading number={2} id="step-address">{t('server.step2')}</StepHeading>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-[3_1_240px] min-w-0 flex flex-col gap-1.5">
            <label htmlFor="address" className="text-sm font-medium">{t('server.addressLabel')}</label>
            <input
              id="address"
              className="field font-mono"
              value={address}
              disabled={locked}
              onChange={e => handleAddress(e.target.value)}
              placeholder={minecraft.kind === 'local' ? 'localhost:25565' : 'play.example.com'}
            />
          </div>
          <div className="flex-[1_1_130px] flex flex-col gap-1.5">
            <label htmlFor="version" className="text-sm font-medium">{t('server.version')}</label>
            <select id="version" className="field" value={target.version} disabled={locked} onChange={e => updateTarget({ version: e.target.value })}>
              {MC_VERSION_OPTIONS.map(version => (
                <option key={version} value={version}>{version === 'auto' ? t('server.versionAuto') : version}</option>
              ))}
            </select>
          </div>
          <button onClick={handleTest} disabled={testing} className="btn btn-ghost">
            {testing ? t('server.testing') : t('server.test')}
          </button>
        </div>

        {result?.ok && (
          <div role="status" className="flex flex-wrap items-center gap-2.5 px-3.5 py-3 rounded-lg bg-good-tint border border-good-edge text-sm">
            <Lamp kind="ok" />
            <strong className="font-semibold">{t('server.found')}</strong>
            <span className="font-mono text-[13px] break-words">
              {result.versionName} · {t('server.players', { online: result.playersOnline ?? 0, max: result.playersMax ?? 0 })}
              {result.latencyMs !== undefined && ` · ${result.latencyMs} ms`}
            </span>
          </div>
        )}
        {result && !result.ok && (
          <p role="alert" className="px-3.5 py-3 rounded-lg bg-bad-tint border border-bad-edge text-sm text-bad break-words">{result.error}</p>
        )}

        <div>
          <button onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="min-h-[44px] text-sm font-semibold text-brand-text">
            {advanced ? t('server.advancedHide') : t('server.advancedShow')}
          </button>
          {advanced && (
            <div className="flex flex-col gap-1.5 pt-1">
              <label htmlFor="post-join" className="text-sm font-medium">{t('server.postJoin')}</label>
              <textarea
                id="post-join"
                rows={2}
                className="field font-mono py-2.5 resize-y [-webkit-text-security:disc] focus:[-webkit-text-security:none]"
                value={target.postJoinCommands.join('\n')}
                disabled={locked}
                onChange={e => updateTarget({ postJoinCommands: e.target.value.split('\n') })}
                onBlur={() => updateTarget({ postJoinCommands: target.postJoinCommands.map(c => c.trim()).filter(Boolean) })}
                placeholder={t('server.postJoinPlaceholder')}
              />
              <span className="text-[13px] text-muted">{t('server.postJoinHint')}</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

const BotRow: React.FC<{ agent: Agent; state?: BotRuntimeState }> = ({ agent, state }) => {
  const { settings, saveMinecraft, toggleBot, openMicrosoftLink } = useAppStore();
  const minecraft = settings.minecraft;
  const account: BotAccount = minecraft.accounts.find(a => a.agentId === agent.id) || {
    agentId: agent.id,
    authMode: 'offline',
    username: agent.name
  };
  const role = ROLE_DEFINITIONS[agent.role];
  const statusId = state?.status || 'offline';
  const busy = !!state && state.status !== 'offline';
  const name = firstName(agent);

  const updateAccount = (patch: Partial<BotAccount>) => {
    saveMinecraft({
      ...minecraft,
      accounts: [...minecraft.accounts.filter(a => a.agentId !== agent.id), { ...account, ...patch }]
    });
  };

  const setAuth = (authMode: AuthMode) => {
    updateAccount({ authMode, username: authMode === 'offline' ? agent.name : '' });
  };

  return (
    <div className="flex flex-col gap-2.5 p-3 border border-line rounded-xl">
      <div className="flex flex-wrap items-center gap-3">
        <Portrait agentId={agent.id} size={52} />
        <div className="flex-1 min-w-[100px]">
          <span className="block text-[15px] font-bold">{name}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <PixelIcon src={role.icon} size={14} />
            {roleName(agent.role)}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
          <Lamp kind={STATUS_LAMPS[statusId]} />
          {tDynamic(`server.status.${statusId}`)}
        </span>
        <button onClick={() => toggleBot(agent.id, agent.name, !busy)} className={`btn min-w-[104px] ${busy ? 'btn-ghost' : 'btn-primary'}`}>
          {busy ? t('server.leave') : t('server.join')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={t('server.accountType', { name })} className="seg-group">
          <button onClick={() => setAuth('offline')} disabled={busy} className={`seg !text-[13px] !px-3 ${account.authMode === 'offline' ? 'on' : ''}`}>{t('server.offline')}</button>
          <button onClick={() => setAuth('microsoft')} disabled={busy} className={`seg !text-[13px] !px-3 ${account.authMode === 'microsoft' ? 'on' : ''}`}>{t('server.premium')}</button>
        </div>
        <div className="flex-[1_1_180px] min-w-0">
          <input
            className="field font-mono"
            aria-label={t('server.accountName', { name })}
            value={account.username}
            disabled={busy}
            maxLength={account.authMode === 'offline' ? 16 : 254}
            onChange={e => updateAccount({ username: e.target.value })}
            placeholder={account.authMode === 'offline' ? t('server.offlinePlaceholder') : t('server.premiumPlaceholder')}
          />
        </div>
      </div>

      {state?.connected && (
        <p className="text-[13px] text-muted">
          {t('server.vitals', { health: Math.round(state.health ?? 0), food: state.food ?? 0 })}
          {state.position && t('server.coordinates', state.position)}
        </p>
      )}

      {state?.authPrompt && (
        <div className="flex flex-wrap items-center gap-3.5 px-3.5 py-3 rounded-lg bg-brand-soft border border-brand-edge">
          <span className="flex-[1_1_240px] text-sm leading-normal">{t('server.msHint')}</span>
          <code className="font-mono text-xl font-medium tracking-widest select-text">{state.authPrompt.userCode}</code>
          <button onClick={() => openMicrosoftLink(state.authPrompt!.verificationUri)} className="btn btn-primary">{t('server.msOpen')}</button>
        </div>
      )}

      {state?.lastError && (
        <p role="alert" className="px-2.5 py-2 rounded-md bg-bad-tint text-[13px] leading-normal text-bad break-words">{state.lastError}</p>
      )}
    </div>
  );
};

const Commanders: React.FC = () => {
  const { settings, saveMinecraft } = useAppStore();
  const minecraft = settings.minecraft;
  const [name, setName] = useState('');

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!minecraft.commanders.includes(trimmed)) {
      saveMinecraft({ ...minecraft, commanders: [...minecraft.commanders, trimmed] });
    }
    setName('');
  };

  return (
    <section aria-labelledby="commanders" className="card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <PixelIcon src="./assets/icons/role_commander.png" size={20} />
        <h2 id="commanders" className="text-base">{t('server.commandersTitle')}</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted">{t('server.commandersBody')}</p>
      {minecraft.commanders.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {minecraft.commanders.map(commander => (
            <span key={commander} className="inline-flex items-center gap-1.5 min-h-[32px] pl-2.5 pr-1 bg-lantern-tint border border-lantern rounded-md font-mono text-[13px] font-medium">
              {commander}
              <button
                onClick={() => saveMinecraft({ ...minecraft, commanders: minecraft.commanders.filter(c => c !== commander) })}
                aria-label={t('server.commanderRemove', { name: commander })}
                className="flex items-center justify-center w-6 h-6 text-lantern-text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="new-commander" className="sr-only">{t('server.commanderAdd')}</label>
        <input id="new-commander" className="field font-mono flex-1 min-w-0" value={name} onChange={e => setName(e.target.value)} placeholder={t('server.commanderPlaceholder')} />
        <button type="submit" className="btn btn-ghost">{t('server.add')}</button>
      </form>
      <div className="p-3 rounded-lg bg-panel text-[13px] leading-relaxed">
        <p className="text-muted">{t('server.chatHint')}</p>
        <code className="block font-mono text-sm font-medium break-words">{t('server.chatExample', { prefix: minecraft.commandPrefix })}</code>
        <p className="mt-1 text-muted">{t('server.whisperHint')}</p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{t('server.prefix')}</span>
        <input
          className="field font-mono !w-24"
          value={minecraft.commandPrefix}
          onChange={e => saveMinecraft({ ...minecraft, commandPrefix: e.target.value })}
        />
      </label>
      <p className="text-[13px] leading-relaxed text-lantern-text">{t('server.spoofWarning')}</p>
    </section>
  );
};

const GameChat: React.FC = () => {
  const { minecraftBots, settings, sendBotChat } = useAppStore();
  const [message, setMessage] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [notice, setNotice] = useState('');
  const online = minecraftBots.filter(b => b.connected);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    const sent = await sendBotChat(message, speaker || undefined);
    setNotice(sent > 0 ? '' : t('server.chatFailed'));
    if (sent > 0) setMessage('');
  };

  return (
    <section aria-labelledby="game-chat" className="card p-5 flex flex-col gap-3">
      <h2 id="game-chat" className="text-base">{t('server.chatTitle')}</h2>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t('server.chatWho')}
        <select className="field" value={speaker} onChange={e => setSpeaker(e.target.value)}>
          <option value="">{settings.minecraft.kind === 'public' ? t('server.chatFirst') : t('server.chatAll')}</option>
          {online.map(bot => (
            <option key={bot.agentId} value={bot.agentId}>{bot.username}</option>
          ))}
        </select>
      </label>
      <form onSubmit={send} className="flex gap-2">
        <label htmlFor="chat-message" className="sr-only">{t('server.chatMessage')}</label>
        <input id="chat-message" className="field flex-1 min-w-0" value={message} onChange={e => setMessage(e.target.value)} placeholder={t('server.chatPlaceholder')} />
        <button type="submit" className="btn btn-ghost" aria-label={t('server.chatSend')}>
          <Send className="w-4 h-4" />
        </button>
      </form>
      {notice && <p role="alert" className="text-[13px] text-bad">{notice}</p>}
    </section>
  );
};

export const Server: React.FC = () => {
  const { agents, minecraftBots, settings, saveMinecraft, connectAllBots, disconnectAllBots } = useAppStore();
  const minecraft = settings.minecraft;
  const crew = agents.filter(a => joinsWorld(a.role, minecraft));
  const locked = minecraftBots.some(b => b.status !== 'offline');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="page-title">{t('server.title')}</h1>
        <p className="text-[15px] text-muted">{t('server.subtitle')}</p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex-[3_1_560px] min-w-0 flex flex-col gap-4">
          <ServerSteps locked={locked} />

          <section aria-labelledby="step-join" className="card p-6 flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StepHeading number={3} id="step-join">{t('server.step3')}</StepHeading>
              <div className="flex gap-2">
                {locked && <button onClick={disconnectAllBots} className="btn btn-ghost">{t('server.leaveAll')}</button>}
                <button onClick={connectAllBots} className="btn btn-primary">{t('server.joinAll')}</button>
              </div>
            </div>
            {locked && <p className="text-[13px] text-muted">{t('server.lockedHint')}</p>}
            {crew.length === 0 && <p className="text-sm text-muted">{t('server.noCrew')}</p>}
            <div className="flex flex-col gap-2.5">
              {crew.map(agent => (
                <BotRow key={agent.id} agent={agent} state={minecraftBots.find(b => b.agentId === agent.id)} />
              ))}
            </div>
          </section>
        </div>

        <div className="flex-[2_1_300px] min-w-0 flex flex-col gap-4">
          {minecraft.kind === 'public' && (
            <aside className="flex flex-col gap-2 p-[18px] bg-lantern-tint border-2 border-lantern rounded-[14px]">
              <h2 className="text-base">{t('server.rulesTitle')}</h2>
              <p className="text-sm leading-relaxed text-lantern-deep">
                {t('server.rulesBody')}
              </p>
            </aside>
          )}

          <Commanders />
          <GameChat />

          <section aria-labelledby="behaviour" className="card p-5 flex flex-col gap-1">
            <h2 id="behaviour" className="mb-1.5 text-base">{t('server.behaviour')}</h2>
            <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm">
              <span>{t('server.reflexes')}</span>
              <input
                type="checkbox"
                className="w-5 h-5 shrink-0 accent-brand"
                checked={minecraft.enableReflexes}
                onChange={e => saveMinecraft({ ...minecraft, enableReflexes: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm">
              <span>{t('server.autoReconnect')}</span>
              <input
                type="checkbox"
                className="w-5 h-5 shrink-0 accent-brand"
                checked={minecraft.autoReconnect}
                onChange={e => saveMinecraft({ ...minecraft, autoReconnect: e.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm">
              <span>
                <span className="block">{t('server.officeInWorld')}</span>
                <span className="block text-[13px] leading-snug text-muted">{t('server.officeInWorldHint')}</span>
              </span>
              <input
                type="checkbox"
                className="w-5 h-5 shrink-0 accent-brand"
                checked={minecraft.officeInWorld !== false}
                onChange={e => saveMinecraft({ ...minecraft, officeInWorld: e.target.checked })}
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
};
