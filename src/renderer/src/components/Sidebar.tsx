import React from 'react';
import { AppPage, useAppStore } from '../stores/useAppStore';
import { joinsWorld } from '@shared/roles';
import { Eye, Home, KanbanSquare, Network, Server, Settings } from 'lucide-react';
import { t, TranslationKey } from '@shared/i18n';
import { LanguageSwitch, Lamp } from './ui';

const NAV_ITEMS: { page: AppPage; label: TranslationKey; icon: React.ReactNode }[] = [
  { page: 'home', label: 'nav.home', icon: <Home className="w-5 h-5" /> },
  { page: 'tasks', label: 'nav.tasks', icon: <KanbanSquare className="w-5 h-5" /> },
  { page: 'team', label: 'nav.team', icon: <Network className="w-5 h-5" /> },
  { page: 'server', label: 'nav.server', icon: <Server className="w-5 h-5" /> },
  { page: 'watch', label: 'nav.watch', icon: <Eye className="w-5 h-5" /> }
];

export const Sidebar: React.FC = () => {
  const { page, setPage, agents, decisions, minecraftBots, settings } = useAppStore();

  const pendingReviews = decisions.filter(d => d.status === 'pending').length;
  const crewSize = agents.filter(a => joinsWorld(a.role, settings.minecraft)).length;
  const online = minecraftBots.filter(b => b.connected).length;
  const joining = minecraftBots.some(b => !b.connected && b.status !== 'offline');
  const { kind, targets } = settings.minecraft;
  const address = targets[kind].host ? `${targets[kind].host}:${targets[kind].port}` : t('sidebar.notConfigured');

  const activePage = page === 'review' ? 'tasks' : page;

  return (
    <nav aria-label={t('nav.mainMenu')} className="w-[248px] shrink-0 flex flex-col gap-6 px-4 py-5 bg-white border-r border-line overflow-y-auto">
      <button onClick={() => setPage('home')} className="flex items-center gap-2.5 px-1 text-left">
        <img src="./assets/icons/logo_small.png" alt="" className="w-11 h-11 block" />
        <span className="font-pixel font-bold text-[22px]">MineOffice</span>
      </button>

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(item => (
          <button
            key={item.page}
            onClick={() => setPage(item.page)}
            aria-current={activePage === item.page ? 'page' : undefined}
            className={`nav-item ${activePage === item.page ? 'on' : ''}`}
          >
            {item.icon}
            <span className="flex-1">{t(item.label)}</span>
            {item.page === 'tasks' && pendingReviews > 0 && (
              <span className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center bg-brand text-white font-bold text-[13px]" aria-label={t('nav.reviewBadge', { count: pendingReviews })}>
                {pendingReviews}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button onClick={() => setPage('server')} className="flex flex-col gap-1 p-3 rounded-[10px] bg-panel border border-line text-left">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Lamp kind={online > 0 ? 'ok' : joining ? 'work' : 'off'} />
            {online > 0 ? t('sidebar.connected') : joining ? t('sidebar.connecting') : t('sidebar.notConnected')}
          </span>
          <span className="font-mono text-xs text-muted truncate">{address}</span>
          <span className="text-[13px] text-muted">
            {t('sidebar.botsOnline', { online, total: crewSize })}
          </span>
        </button>
        <button
          onClick={() => setPage('settings')}
          aria-current={page === 'settings' ? 'page' : undefined}
          className={`nav-item ${page === 'settings' ? 'on' : ''}`}
        >
          <Settings className="w-5 h-5" />
          {t('nav.settings')}
        </button>
        <LanguageSwitch />
      </div>
    </nav>
  );
};
