import React, { useEffect, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { AppSettings, LLMProvider, McpServerConfig, PermissionAction, WorkspaceInfo } from '@shared/types';
import { t } from '@shared/i18n';
import { useAppStore as useStore } from '../stores/useAppStore';
import { DEFAULT_MODELS, MODEL_SUGGESTIONS } from '@shared/models';
import { Lamp, ProviderLogo } from '../components/ui';

export const providers = (): { id: LLMProvider; name: string; note: string; hint: string }[] => [
  { id: 'openrouter', name: 'OpenRouter', note: t('provider.openrouter.note'), hint: 'sk-or-...' },
  { id: 'gemini', name: 'Google Gemini', note: t('provider.needsKey'), hint: 'AIza...' },
  { id: 'claude', name: 'Anthropic Claude', note: t('provider.needsKey'), hint: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', note: t('provider.needsKey'), hint: 'sk-...' },
  { id: 'ollama', name: t('provider.ollama.name'), note: t('provider.ollama.note'), hint: 'http://localhost:11434' }
];

const WorkspacePicker: React.FC<{ form: AppSettings; onChange: (workspacePath: string) => Promise<void> }> = ({ form, onChange }) => {
  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = window.electronAPI;

  const refresh = async (workspacePath: string) => setInfo(await api?.inspectWorkspace(workspacePath));

  useEffect(() => {
    refresh(form.workspacePath);
  }, [form.workspacePath]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err: any) {
      setError(err?.message || String(err));
    }
    setBusy(false);
  };

  const choose = () => run(async () => {
    const picked: string | null = await api.pickWorkspace();
    if (picked) await onChange(picked);
  });

  const createNew = () => run(async () => {
    await onChange(await api.createProject());
  });

  const enable = () => run(async () => {
    const result = await api.enableGit(form.workspacePath);
    if (!result.ok) setError(result.error);
    await refresh(form.workspacePath);
  });

  const stateText = () => {
    if (!info) return '';
    switch (info.state) {
      case 'none': return t('workspace.none');
      case 'missing': return t('workspace.state.missing');
      case 'no-git': return t('workspace.state.noGit');
      case 'not-git': return t('workspace.state.notGit');
      case 'no-commits': return t('workspace.state.noCommits');
      case 'detached': return t('workspace.state.detached');
      default:
        return info.changedFiles
          ? t('workspace.state.readyChanges', { branch: info.branch ?? '', count: info.changedFiles })
          : t('workspace.state.ready', { branch: info.branch ?? '' });
    }
  };

  return (
    <section aria-labelledby="workspace" className="card p-6 flex flex-col gap-3">
      <h2 id="workspace" className="text-lg">{t('workspace.title')}</h2>
      <p className="text-sm leading-relaxed text-muted">{t('workspace.body')}</p>
      <p className="px-3.5 py-3 rounded-lg bg-panel text-sm leading-relaxed">{t('workspace.advice')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={createNew} disabled={busy} className="btn btn-primary">{t('workspace.createNew')}</button>
        <button type="button" onClick={choose} disabled={busy} className="btn btn-ghost">{t('workspace.choose')}</button>
        {(info?.state === 'not-git' || info?.state === 'no-commits') && !info.tooBroad && (
          <button type="button" onClick={enable} disabled={busy} className="btn btn-ghost">{t('workspace.enableGit')}</button>
        )}
      </div>

      {info && (
        <div className="flex flex-col gap-1 px-3.5 py-3 rounded-lg border border-line">
          {info.path && <code className="font-mono text-[13px] break-all select-text">{info.path}</code>}
          <span className="flex items-start gap-2 text-sm">
            <span className="mt-1.5"><Lamp kind={info.state === 'ready' ? 'ok' : info.state === 'none' ? 'off' : 'bad'} /></span>
            {stateText()}
          </span>
        </div>
      )}
      {info?.tooBroad && <p role="alert" className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm leading-relaxed text-lantern-deep">{t('workspace.warn.tooBroad')}</p>}
      {info?.isApp && <p role="alert" className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm leading-relaxed text-lantern-deep">{t('workspace.warn.isApp')}</p>}
      {error && <p role="alert" className="px-3.5 py-3 rounded-lg bg-bad-tint border border-bad-edge text-sm text-bad break-words">{error}</p>}
    </section>
  );
};

const McpServers: React.FC<{ servers: Record<string, McpServerConfig>; onChange: (servers: Record<string, McpServerConfig>) => void }> = ({ servers, onChange }) => {
  const statuses = useStore(state => state.mcpStatuses);
  const [name, setName] = useState('');
  const [type, setType] = useState<'local' | 'remote'>('local');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const label = name.trim();
    const value = target.trim();
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(label)) return setError(t('mcp.nameInvalid'));
    if (!value) return setError(t('mcp.fieldRequired'));
    setError(null);
    const config: McpServerConfig =
      type === 'local'
        ? { type, command: (value.match(/"[^"]*"|\S+/g) || []).map(part => part.replace(/^"|"$/g, '')), enabled: true, permission: 'ask' }
        : { type, url: value, enabled: true, permission: 'ask' };
    onChange({ ...servers, [label]: config });
    setName('');
    setTarget('');
  };

  const stateText = (server: string) => {
    const status = statuses.find(s => s.name === server);
    if (!status) return t('mcp.state.connecting');
    if (status.state === 'connected') return t('mcp.state.connected', { count: status.tools });
    if (status.state === 'failed') return t('mcp.state.failed', { error: status.error ?? '' });
    return status.state === 'disabled' ? t('mcp.state.disabled') : t('mcp.state.connecting');
  };
  const lamp = (server: string) => {
    const state = statuses.find(s => s.name === server)?.state;
    return state === 'connected' ? 'ok' : state === 'failed' ? 'bad' : state === 'disabled' ? 'off' : 'work';
  };

  return (
    <section aria-labelledby="mcp" className="card p-6 flex flex-col gap-3">
      <h2 id="mcp" className="text-lg">{t('mcp.title')}</h2>
      <p className="text-sm leading-relaxed text-muted">{t('mcp.body')}</p>
      <p className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm leading-relaxed text-lantern-deep">{t('mcp.warning')}</p>

      {Object.keys(servers).length === 0 && <p className="text-sm text-muted">{t('mcp.none')}</p>}
      {Object.entries(servers).map(([server, config]) => (
        <div key={server} className="flex flex-col gap-2 p-3 border border-line rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-1 min-w-[120px] font-bold text-[15px] break-all">{server}</span>
            <select
              className="field !w-auto"
              aria-label={t('mcp.permission', { name: server })}
              value={config.permission}
              onChange={e => onChange({ ...servers, [server]: { ...config, permission: e.target.value as PermissionAction } })}
            >
              <option value="ask">{t('mcp.permAsk')}</option>
              <option value="allow">{t('mcp.permAllow')}</option>
              <option value="deny">{t('mcp.permDeny')}</option>
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const { [server]: _removed, ...rest } = servers;
                onChange(rest);
              }}
            >
              {t('mcp.remove', { name: server })}
            </button>
          </div>
          <code className="font-mono text-[13px] text-muted break-all">{config.type === 'local' ? config.command.join(' ') : config.url}</code>
          <span className="flex items-start gap-2 text-sm break-words">
            <span className="mt-1.5"><Lamp kind={lamp(server)} /></span>
            {stateText(server)}
          </span>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2 pt-1">
        <label className="flex-[1_1_120px] min-w-0 flex flex-col gap-1.5 text-sm font-medium">
          {t('mcp.name')}
          <input className="field font-mono" value={name} onChange={e => setName(e.target.value)} placeholder="search" />
        </label>
        <label className="flex-[1_1_160px] min-w-0 flex flex-col gap-1.5 text-sm font-medium">
          {t('mcp.type')}
          <select className="field" value={type} onChange={e => setType(e.target.value as 'local' | 'remote')}>
            <option value="local">{t('mcp.typeLocal')}</option>
            <option value="remote">{t('mcp.typeRemote')}</option>
          </select>
        </label>
        <label className="flex-[3_1_260px] min-w-0 flex flex-col gap-1.5 text-sm font-medium">
          {type === 'local' ? t('mcp.command') : t('mcp.url')}
          <input
            className="field font-mono"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={type === 'local' ? 'npx -y @modelcontextprotocol/server-memory' : 'https://example.com/mcp'}
          />
        </label>
        <button type="button" onClick={add} className="btn btn-ghost">{t('mcp.add')}</button>
      </div>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
    </section>
  );
};

export function setProviderCredential(settings: AppSettings, provider: LLMProvider, value: string): AppSettings {
  const providers: any = { ...settings.providers };
  providers[provider] = { ...providers[provider], [provider === 'ollama' ? 'baseUrl' : 'apiKey']: value };
  return { ...settings, providers };
}

export function providerCredential(settings: AppSettings, provider: LLMProvider): string {
  const entry: any = settings.providers[provider];
  return (provider === 'ollama' ? entry.baseUrl : entry.apiKey) || '';
}

export const AiSettings: React.FC = () => {
  const { settings, saveSettings } = useAppStore();
  const [form, setForm] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-[860px]">
      <header className="flex flex-col gap-1">
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="text-[15px] text-muted">{t('settings.subtitle')}</p>
      </header>

      <section aria-labelledby="providers" className="card p-6 flex flex-col gap-3">
        <h2 id="providers" className="text-lg">{t('settings.main')}</h2>
        {providers().map(provider => {
          const active = form.activeDefaultProvider === provider.id;
          return (
            <div key={provider.id} className={`flex flex-col gap-2.5 p-3.5 rounded-xl border-2 ${active ? 'border-brand bg-brand-soft' : 'border-line-strong bg-white'}`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="active-provider"
                  className="w-5 h-5 shrink-0 accent-brand"
                  checked={active}
                  onChange={() => setForm({ ...form, activeDefaultProvider: provider.id })}
                />
                <ProviderLogo provider={provider.id} size={28} />
                <span>
                  <span className="block text-[15px] font-bold">{provider.name}</span>
                  <span className="block text-[13px] text-muted">{provider.note}</span>
                </span>
              </label>
              <div>
                <label htmlFor={`key-${provider.id}`} className="sr-only">{provider.id === 'ollama' ? t('settings.ollamaAddress') : t('settings.apiKeyFor', { name: provider.name })}</label>
                <input
                  id={`key-${provider.id}`}
                  className="field font-mono"
                  type={provider.id === 'ollama' ? 'text' : 'password'}
                  autoComplete="off"
                  value={providerCredential(form, provider.id)}
                  onChange={e => setForm(setProviderCredential(form, provider.id, e.target.value))}
                  placeholder={provider.hint}
                />
              </div>
              {provider.id === 'openai' && (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  {t('settings.openaiBaseUrl')}
                  <input
                    className="field font-mono"
                    value={form.providers.openai.baseUrl || ''}
                    onChange={e => setForm({ ...form, providers: { ...form.providers, openai: { ...form.providers.openai, baseUrl: e.target.value } } })}
                    placeholder="http://localhost:1234/v1"
                  />
                </label>
              )}
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('settings.model')}
                <input
                  className="field font-mono"
                  list={`models-${provider.id}`}
                  value={form.providers[provider.id].model}
                  onChange={e => setForm({ ...form, providers: { ...form.providers, [provider.id]: { ...form.providers[provider.id], model: e.target.value } } })}
                  placeholder={DEFAULT_MODELS[provider.id]}
                />
                <datalist id={`models-${provider.id}`}>
                  {MODEL_SUGGESTIONS[provider.id].map(id => <option key={id} value={id} />)}
                </datalist>
              </label>
            </div>
          );
        })}
      </section>

      <WorkspacePicker form={form} onChange={workspacePath => saveSettings({ ...form, workspacePath })} />
      <McpServers servers={form.mcpServers || {}} onChange={mcpServers => saveSettings({ ...form, mcpServers })} />

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary">{t('settings.save')}</button>
        {saved && <span role="status" className="text-sm font-medium text-good">{t('settings.saved')}</span>}
      </div>
    </form>
  );
};
