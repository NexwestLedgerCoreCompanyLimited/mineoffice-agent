import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { AgentRole, LLMProvider } from '@shared/types';
import { ROLE_DEFINITIONS, ROLE_ORDER, roleName, roleSummary } from '@shared/roles';
import { t, TranslationKey, tDynamic } from '@shared/i18n';
import { isProviderConfigured } from '@shared/models';
import { firstName, PixelIcon, Portrait, ProviderLogo } from '../components/ui';

const providerOptions = (): { id: LLMProvider | 'default'; label: string }[] => [
  { id: 'default', label: t('team.brainDefault') },
  { id: 'openrouter', label: t('team.provider.openrouter') },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'claude', label: 'Anthropic Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'ollama', label: t('team.provider.ollama') }
];

const LOG_FILTERS: { id: string; label: TranslationKey }[] = [
  { id: 'all', label: 'log.all' },
  { id: 'thought', label: 'log.thought' },
  { id: 'tool', label: 'log.tool' }
];

const LOG_COLORS: Record<string, string> = {
  error: 'text-bad',
  warn: 'text-lantern-text',
  success: 'text-good'
};

const WorkLog: React.FC<{ agentId: string }> = ({ agentId }) => {
  const logs = useAppStore(state => state.logs[agentId]) || [];
  const [filter, setFilter] = useState('all');
  const list = useRef<HTMLDivElement>(null);
  const visible = logs.filter(log => filter === 'all' || log.level === filter);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [visible.length, agentId]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h3 className="text-[15px]">{t('log.title')}</h3>
        <div role="group" aria-label={t('log.filterGroup')} className="seg-group">
          {LOG_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`seg ${filter === f.id ? 'on' : ''}`}>
              {t(f.label)}
            </button>
          ))}
        </div>
      </div>
      <div ref={list} className="max-h-[240px] overflow-y-auto rounded-lg bg-panel border border-line p-3 flex flex-col gap-1.5 select-text">
        {visible.length === 0 && <p className="text-sm text-muted">{t('log.empty')}</p>}
        {visible.map(log => (
          <p key={log.id} className={`font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words ${LOG_COLORS[log.level] || 'text-ink'}`}>
            <span className="text-faint">{log.timestamp} </span>
            {log.message}
          </p>
        ))}
      </div>
    </div>
  );
};

export const Team: React.FC = () => {
  const { agents, skills, selectedAgentId, settings, setAgentRole, setAgentProvider, openAgent, minecraftBots } = useAppStore();
  const [notice, setNotice] = useState<string | null>(null);

  const selected = agents.find(a => a.id === selectedAgentId) || agents[0];
  if (!selected) return null;

  // What really answers: a chosen service with no key falls back to the team's main one
  const brainOf = (agentId: string): LLMProvider => {
    const chosen = settings.agentProviders[agentId];
    return chosen && chosen !== 'default' && isProviderConfigured(settings, chosen) ? chosen : settings.activeDefaultProvider;
  };
  const brainName = (provider: LLMProvider) => providerOptions().find(option => option.id === provider)!.label;

  const role = ROLE_DEFINITIONS[selected.role];
  const roleSkills = skills.filter(skill => role.skillCategories.includes(skill.category));
  const worksInOffice = !ROLE_DEFINITIONS[selected.role].inGame;
  const abilities = worksInOffice
    ? [tDynamic(`role.${selected.role}.duty1`), tDynamic(`role.${selected.role}.duty2`)]
    : roleSkills.map(skill => tDynamic(`skill.${skill.id}`));

  const pick = (agentId: string) => {
    setNotice(null);
    openAgent(agentId);
  };

  const changeRole = async (next: AgentRole) => {
    if (next === selected.role) return;
    const previousCommander = agents.find(a => a.role === 'commander');
    const error = await setAgentRole(selected.id, next);
    if (error) {
      setNotice(error);
    } else if (next === 'commander' && previousCommander) {
      setNotice(t('team.swapped', { name: firstName(selected), previous: firstName(previousCommander), role: roleName(selected.role) }));
    } else {
      setNotice(null);
    }
  };

  const bot = minecraftBots.find(b => b.agentId === selected.id);
  const stats = [
    t('team.statsDone', { count: selected.stats.tasksCompleted }),
    selected.stats.blocksMined ? t('team.statsMined', { count: selected.stats.blocksMined }) : '',
    selected.stats.blocksPlaced ? t('team.statsPlaced', { count: selected.stats.blocksPlaced }) : '',
    bot?.connected ? `HP ${Math.round(bot.health ?? 0)}/20` : ''
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="page-title">{t('team.title')}</h1>
        <p className="text-[15px] text-muted">{t('team.subtitle')}</p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label={t('team.members')} className="card flex-[1_1_260px] min-w-0 p-3 flex flex-col gap-0.5">
          {agents.map(agent => {
            const isSelected = agent.id === selected.id;
            return (
              <button
                key={agent.id}
                onClick={() => pick(agent.id)}
                aria-pressed={isSelected}
                className={`w-full flex items-center gap-3 min-h-[64px] px-2.5 py-2 rounded-[10px] border-2 text-left ${
                  isSelected ? 'bg-brand-soft border-brand' : 'border-transparent hover:bg-panel'
                }`}
              >
                <Portrait agentId={agent.id} size={48} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold">{firstName(agent)}</span>
                  <span className="block text-[13px] text-muted">{roleName(agent.role)}</span>
                </span>
                <ProviderLogo provider={brainOf(agent.id)} size={20} label={brainName(brainOf(agent.id))} />
                <PixelIcon src={ROLE_DEFINITIONS[agent.role].icon} size={24} />
              </button>
            );
          })}
        </section>

        <section aria-labelledby="agent-name" className="card flex-[3_1_520px] min-w-0 p-7 flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-5">
            <Portrait agentId={selected.id} size={96} />
            <div className="flex-[1_1_240px] min-w-0">
              <h2 id="agent-name" className="text-[26px] leading-tight">{firstName(selected)}</h2>
              <p className="mt-0.5 text-[15px] leading-relaxed text-muted">{roleSummary(selected.role)}</p>
              <p className="mt-1 text-[13px] text-muted">{stats.join(' · ')}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-[15px]">{t('team.changeRole')}</h3>
            <div className="grid grid-cols-3 gap-2.5">
              {ROLE_ORDER.map(id => {
                const option = ROLE_DEFINITIONS[id];
                const isCurrent = id === selected.role;
                return (
                  <button
                    key={id}
                    onClick={() => changeRole(id)}
                    aria-pressed={isCurrent}
                    className={`choice flex-col !gap-1.5 min-h-[112px] ${isCurrent ? (id === 'commander' ? 'lead' : 'on') : ''}`}
                  >
                    <PixelIcon src={option.icon} size={32} />
                    <span className="text-[15px] font-bold">{roleName(id)}</span>
                    <span className="text-[13px] leading-snug text-muted">
                      {option.tier === 'command' ? t('role.place.command') : option.inGame ? t('role.place.inGame') : t('role.place.outside')}
                    </span>
                  </button>
                );
              })}
            </div>
            {notice && (
              <p role="status" className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm leading-normal text-lantern-deep">{notice}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex-[3_1_300px] min-w-0 flex flex-col gap-2.5">
              <h3 className="text-[15px]">{worksInOffice ? t('team.duties') : t('team.skills')}</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {abilities.map(ability => (
                  <div key={ability} className="flex items-center gap-2.5 min-h-[44px] px-3 py-2 bg-panel rounded-lg text-sm">
                    <span className="w-4 h-4 shrink-0 bg-good" style={{ boxShadow: 'inset 2px 2px 0 #3BB073, inset -2px -2px 0 #126B39' }} aria-hidden="true" />
                    {ability}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-[1_1_220px] min-w-0 flex flex-col gap-2.5">
              <h3 className="text-[15px]">
                <label htmlFor="agent-model">{t('team.brain')}</label>
              </h3>
              <div className="flex items-center gap-2.5">
                <ProviderLogo provider={brainOf(selected.id)} size={28} />
                <select
                  id="agent-model"
                  className="field"
                  value={settings.agentProviders[selected.id] || 'default'}
                  onChange={e => setAgentProvider(selected.id, e.target.value as LLMProvider | 'default')}
                >
                  {providerOptions().map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-[13px] leading-normal text-muted">{t('team.brainHint')}</p>
            </div>
          </div>

          <WorkLog agentId={selected.id} />
        </section>
      </div>
    </div>
  );
};
