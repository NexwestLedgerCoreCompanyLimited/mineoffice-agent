import React from 'react';
import { Agent, BotRuntimeState, LLMProvider, TaskStatus } from '@shared/types';
import { ROLE_DEFINITIONS } from '@shared/roles';
import { TEAM_IDS } from '@shared/team';
import { LANGUAGES, t, tDynamic } from '@shared/i18n';
import { useAppStore } from '../stores/useAppStore';

export type LampKind = 'ok' | 'work' | 'wait' | 'bad' | 'off';

export const Lamp: React.FC<{ kind: LampKind }> = ({ kind }) => <span className={`lamp ${kind}`} aria-hidden="true" />;

/** An agent's face in an inventory slot. An unknown id, which may come from a remote server, never picks a file. */
export const Portrait: React.FC<{ agentId: string; size: number }> = ({ agentId, size }) => {
  const id = TEAM_IDS.includes(agentId) ? agentId : 'marlow';
  return (
    <span className="slot" style={{ width: size, height: size }}>
      <img className="px" src={`./assets/portraits/${id}.png`} alt="" style={{ width: Math.round(size * 0.74), height: Math.round(size * 0.74) }} />
    </span>
  );
};

/** The maker's logo, so you can tell at a glance which AI is in use. The name is always next to it or in `label`. */
export const ProviderLogo: React.FC<{ provider: LLMProvider; size: number; label?: string }> = ({ provider, size, label }) => (
  <img src={`./assets/providers/${provider}.svg`} alt={label || ''} title={label} className="shrink-0" style={{ width: size, height: size }} />
);

export const PixelIcon: React.FC<{ src: string; size: number }> = ({ src, size }) => (
  <img className="px" src={src} alt="" style={{ width: size, height: size }} />
);

export const firstName = (agent: Agent) => agent.displayName.split(' ')[0];

export const taskLabel = (status: string) => tDynamic(`task.${status}`);

export const eventText = (kind: string, detail?: string) => tDynamic(`event.${kind}`, { detail: detail || '' });

export const LanguageSwitch: React.FC = () => {
  const { settings, changeLanguage } = useAppStore();
  return (
    <div role="group" aria-label={t('language.label')} className="seg-group">
      {LANGUAGES.map(language => (
        <button
          key={language.code}
          type="button"
          lang={language.code}
          onClick={() => changeLanguage(language.code)}
          aria-pressed={settings.language === language.code}
          className={`seg !min-h-[36px] !px-3 !text-[13px] ${settings.language === language.code ? 'on' : ''}`}
        >
          {language.name}
        </button>
      ))}
    </div>
  );
};

export const TASK_LAMPS: Record<TaskStatus, LampKind> = {
  backlog: 'off',
  in_progress: 'work',
  review: 'wait',
  done: 'ok'
};

/** What to say about an agent right now, combining its work with whether its bot is in the game. */
export function describeAgent(agent: Agent, bot?: BotRuntimeState): { lamp: LampKind; status: string; detail: string } {
  const role = ROLE_DEFINITIONS[agent.role];

  if (agent.status === 'error') return { lamp: 'bad', status: t('agent.problem'), detail: t('agent.problemDetail') };
  if (agent.status === 'waiting_approval') return { lamp: 'wait', status: t('agent.waitingReview'), detail: agent.currentActivity || '' };
  if (agent.status === 'planning') return { lamp: 'work', status: t('agent.planning'), detail: agent.currentActivity || '' };
  if (agent.status === 'working') return { lamp: 'work', status: t('agent.working'), detail: agent.currentActivity || '' };

  if (!role.inGame) {
    return { lamp: 'ok', status: agent.role === 'commander' ? t('agent.readyGoal') : t('agent.readyTask'), detail: '' };
  }
  if (bot?.connected) return { lamp: 'ok', status: t('agent.inGameIdle'), detail: t('agent.inGameIdleDetail') };
  if (bot && bot.status !== 'offline') return { lamp: 'work', status: t('agent.joining'), detail: '' };
  return { lamp: 'off', status: t('agent.notInGame'), detail: t('agent.notInGameDetail') };
}
