import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Task, TaskStatus } from '@shared/types';
import { roleName } from '@shared/roles';
import { t, TranslationKey } from '@shared/i18n';
import { firstName, Lamp, LampKind, PixelIcon, Portrait } from '../components/ui';

const FILTERS: { id: string; label: TranslationKey }[] = [
  { id: 'all', label: 'tasks.filter.all' },
  { id: 'minecraft', label: 'tasks.filter.minecraft' },
  { id: 'code', label: 'tasks.filter.code' },
  { id: 'research', label: 'tasks.filter.research' }
];

const COLUMNS: { status: TaskStatus; title: TranslationKey; lamp: LampKind; empty: TranslationKey }[] = [
  { status: 'backlog', title: 'tasks.column.backlog', lamp: 'off', empty: 'tasks.empty.backlog' },
  { status: 'in_progress', title: 'tasks.column.in_progress', lamp: 'work', empty: 'tasks.empty.in_progress' },
  { status: 'review', title: 'tasks.column.review', lamp: 'wait', empty: 'tasks.empty.review' },
  { status: 'done', title: 'tasks.column.done', lamp: 'ok', empty: 'tasks.empty.done' }
];

const TaskCard: React.FC<{ task: Task }> = ({ task }) => {
  const { agents, decisions, tasks, executeTask, openReview } = useAppStore();
  const worker = agents.find(a => a.id === task.assignedAgentId);
  const waitingFor = task.dependencies
    .map(id => tasks.find(other => other.id === id))
    .filter(other => other && other.status !== 'done')
    .map(other => other!.title);
  const decision = decisions.find(d => d.taskId === task.id && d.status === 'pending');

  return (
    <article className="flex flex-col gap-2.5 p-3.5 bg-white border border-line-strong rounded-[10px]">
      <h3 className="text-[15px] leading-snug font-semibold break-words">{task.title}</h3>

      {task.lastError && (
        <p className="px-2.5 py-2 rounded-md bg-bad-tint text-[13px] leading-normal text-bad break-words">{task.lastError}</p>
      )}

      {task.reviewFeedback && task.status === 'backlog' && (
        <p className="px-2.5 py-2 rounded-md bg-lantern-tint text-[13px] leading-normal text-lantern-deep break-words">{t('tasks.needsChange', { note: task.reviewFeedback })}</p>
      )}

      {waitingFor.length > 0 && (
        <p className="text-[13px] leading-normal text-muted break-words">{t('tasks.waitingFor', { list: waitingFor.join(', ') })}</p>
      )}

      {worker && (
        <div className="flex items-center gap-2">
          <Portrait agentId={worker.id} size={32} />
          <span className="flex-1 min-w-0 text-[13px] leading-tight text-muted">
            <strong className="block font-semibold text-ink">{firstName(worker)}</strong>
            {roleName(worker.role)}
          </span>
        </div>
      )}

      {task.result && (
        <details className="text-[13px] leading-normal">
          <summary className="cursor-pointer font-semibold text-brand-text">{t('tasks.result')}</summary>
          <p className="mt-1.5 max-h-[240px] overflow-auto whitespace-pre-wrap break-words select-text text-muted">{task.result}</p>
        </details>
      )}

      {task.status === 'backlog' && waitingFor.length === 0 && (
        <button onClick={() => executeTask(task.id)} className={`btn ${task.lastError ? 'btn-ghost' : 'btn-primary'}`}>
          {task.lastError ? t('tasks.retry') : t('tasks.start')}
        </button>
      )}
      {task.status === 'review' && decision && (
        <button onClick={() => openReview(decision.id)} className="btn btn-primary">{t('tasks.review')}</button>
      )}
    </article>
  );
};

export const Tasks: React.FC = () => {
  const { tasks, setPage } = useAppStore();
  const [filter, setFilter] = useState('all');
  const visible = tasks.filter(t => filter === 'all' || t.category === filter);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">{t('tasks.title')}</h1>
          <p className="text-[15px] text-muted">{t('tasks.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={t('tasks.filterGroup')} className="seg-group" style={{ background: '#DDE4EF' }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`seg ${filter === f.id ? 'on' : ''}`}>
                {t(f.label)}
              </button>
            ))}
          </div>
          <button onClick={() => setPage('home')} className="btn btn-primary">
            <PixelIcon src="./assets/icons/goal.png" size={20} />
            {t('tasks.newGoal')}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4 items-start">
        {COLUMNS.map(column => {
          const columnTasks = visible.filter(t => t.status === column.status);
          return (
            <section key={column.status} className="flex flex-col gap-2.5 p-3.5 min-h-[520px] rounded-[14px] border border-line" style={{ background: '#F8FAFD' }}>
              <h2 className="mx-0.5 flex items-center gap-2 text-[15px]">
                <Lamp kind={column.lamp} />
                {t(column.title)}
                <span className="ml-auto text-base font-bold" style={{ color: '#3D4B63' }}>{columnTasks.length}</span>
              </h2>
              {columnTasks.length === 0 && <p className="px-2 py-5 text-center text-sm text-faint">{t(column.empty)}</p>}
              {columnTasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
};
