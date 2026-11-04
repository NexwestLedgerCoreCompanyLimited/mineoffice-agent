import React, { useEffect } from 'react';
import { useAppStore } from './stores/useAppStore';
import { Sidebar } from './components/Sidebar';
import { CommandCenter } from './pages/CommandCenter';
import { Tasks } from './pages/Tasks';
import { Review } from './pages/Review';
import { Team } from './pages/Team';
import { Server } from './pages/Server';
import { Watch } from './pages/Watch';
import { AiSettings } from './pages/AiSettings';
import { Setup } from './pages/Setup';

export const App: React.FC = () => {
  const { page, ready, settings, loadInitialState } = useAppStore();

  useEffect(() => {
    loadInitialState();
  }, [loadInitialState]);

  // Someone who already has a key, for example from the environment, needs no introduction
  const active = settings.activeDefaultProvider;
  const hasBrain = active === 'ollama' || !!(settings.providers[active] as any).apiKey;
  const showSetup = ready && !settings.setupCompleted && !hasBrain;

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  // Text comes from t() at render time, so a new key redraws everything in the new language
  return (
    <div key={settings.language} className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="workshop flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-8 pt-8 pb-12">
          {page === 'home' && <CommandCenter />}
          {page === 'tasks' && <Tasks />}
          {page === 'review' && <Review />}
          {page === 'team' && <Team />}
          {page === 'server' && <Server />}
          {page === 'watch' && <Watch />}
          {page === 'settings' && <AiSettings />}
        </div>
      </main>
      {showSetup && <Setup />}
    </div>
  );
};
