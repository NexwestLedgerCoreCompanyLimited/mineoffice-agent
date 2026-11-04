import React, { useEffect, useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Agent, Department, ImageAttachment, PlanMode, WorkspaceInfo } from '@shared/types';
import { ROLE_DEFINITIONS, roleName } from '@shared/roles';
import { t, TranslationKey } from '@shared/i18n';
import { describeAgent, eventText, firstName, Lamp, PixelIcon, Portrait, taskLabel, TASK_LAMPS } from '../components/ui';

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const readImage = (file: File) =>
  new Promise<ImageAttachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mimeType: file.type, base64: String(reader.result).split(',')[1] || '' });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const MODES: { id: PlanMode; label: TranslationKey; placeholder: TranslationKey; samples: TranslationKey[] }[] = [
  {
    id: 'minecraft',
    label: 'goal.mode.minecraft',
    placeholder: 'goal.placeholder.minecraft',
    samples: ['goal.sample.minecraft1', 'goal.sample.minecraft2', 'goal.sample.minecraft3']
  },
  {
    id: 'code',
    label: 'goal.mode.code',
    placeholder: 'goal.placeholder.code',
    samples: ['goal.sample.code1', 'goal.sample.code2']
  },
  {
    id: 'research',
    label: 'goal.mode.research',
    placeholder: 'goal.placeholder.research',
    samples: ['goal.sample.research1', 'goal.sample.research2']
  },
  {
    id: 'project',
    label: 'goal.mode.project',
    placeholder: 'goal.placeholder.project',
    samples: ['goal.sample.project1', 'goal.sample.project2', 'goal.sample.project3']
  }
];

const GoalComposer: React.FC = () => {
  const { planGoal, discardTasks, startRun, setRunStopped, tasks, agents, setPage, settings } = useAppStore();
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState<PlanMode>('minecraft');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | undefined>();
  const [stopped, setStopped] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [plannedIds, setPlannedIds] = useState<string[] | null>(null);
  const [planError, setPlanError] = useState<string | undefined>();
  const [started, setStarted] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const usesWorkspace = mode === 'code' || mode === 'project';

  // Code work needs a usable project folder, so say so here instead of failing after planning
  useEffect(() => {
    if (usesWorkspace) window.electronAPI?.inspectWorkspace(settings.workspacePath).then(setWorkspace);
  }, [usesWorkspace, settings.workspacePath]);
  const blockedByWorkspace = usesWorkspace && !!workspace && workspace.state !== 'ready';

  const addImages = async (files: File[]) => {
    const pictures = files.filter(file => file.type.startsWith('image/'));
    if (pictures.length === 0) return;
    if (images.length + pictures.length > MAX_IMAGES) return setImageError(t('goal.imageTooMany', { count: MAX_IMAGES }));
    const tooBig = pictures.find(file => file.size > MAX_IMAGE_BYTES);
    if (tooBig) return setImageError(t('goal.imageTooBig', { name: tooBig.name }));
    setImageError(null);
    const read = await Promise.all(pictures.map(readImage));
    setImages(current => [...current, ...read]);
  };

  const current = MODES.find(m => m.id === mode)!;
  const commander = agents.find(a => a.role === 'commander');
  const commanderName = commander ? firstName(commander) : roleName('commander');
  const planned = (plannedIds || []).map(id => tasks.find(t => t.id === id)).filter(Boolean) as typeof tasks;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim() || planning || blockedByWorkspace) return;
    setPlanning(true);
    setStarted(false);
    setRunId(undefined);
    setStopped(false);
    const result = await planGoal(goal.trim(), mode, images);
    setPlannedIds(result.tasks.map(t => t.id));
    setPlanError(result.error);
    setPlanning(false);
  };

  const closePlan = async () => {
    if (plannedIds && !started) await discardTasks(plannedIds);
    setPlannedIds(null);
    setPlanError(undefined);
  };

  const startAll = async () => {
    setStarted(true);
    setRunId(await startRun(planned.map(task => task.id)));
  };

  const toggleStopped = async () => {
    if (!runId) return;
    await setRunStopped(runId, !stopped);
    setStopped(!stopped);
  };

  const finish = () => {
    setPlannedIds(null);
    setPlanError(undefined);
    setGoal('');
    setImages([]);
    setRunId(undefined);
  };

  return (
    <section aria-labelledby="goal-title" className="card p-7 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 id="goal-title" className="page-title">{t('goal.title')}</h1>
        <p className="text-[15px] text-muted">{t('goal.subtitle', { name: commanderName })}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label htmlFor="goal" className="sr-only">{t('goal.label')}</label>
        <textarea
          id="goal"
          rows={2}
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onPaste={e => addImages(Array.from(e.clipboardData.files))}
          placeholder={t(current.placeholder)}
          className="w-full px-4 py-3.5 rounded-[10px] bg-[#F8FAFD] text-[17px] leading-relaxed resize-y placeholder:text-faint"
          style={{ border: '2px solid #C6D1E1' }}
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="btn btn-ghost cursor-pointer">
            {t('goal.images')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={e => {
                addImages(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
          </label>
          {images.map((image, index) => (
            <span key={`${image.name}-${index}`} className="inline-flex items-center gap-2 pl-1 pr-2 py-1 bg-panel border border-line rounded-lg">
              <img src={`data:${image.mimeType};base64,${image.base64}`} alt={image.name} className="w-10 h-10 object-cover rounded" />
              <button
                type="button"
                onClick={() => setImages(current => current.filter((_, at) => at !== index))}
                aria-label={t('goal.imageRemove', { name: image.name })}
                className="text-[13px] font-semibold text-brand-text"
              >
                {t('goal.imageRemoveShort')}
              </button>
            </span>
          ))}
          <span className="flex-[1_1_240px] text-[13px] text-muted">{t('goal.imagesHint')}</span>
        </div>
        {imageError && <p role="alert" className="text-sm text-bad">{imageError}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={t('goal.modeGroup')} className="seg-group">
            {MODES.map(m => (
              <button key={m.id} type="button" onClick={() => setMode(m.id)} className={`seg ${mode === m.id ? 'on' : ''}`}>
                {t(m.label)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 flex-[1_1_280px]">
            {current.samples.map(sample => (
              <button key={sample} type="button" onClick={() => setGoal(t(sample))} className="chip">
                {t(sample)}
              </button>
            ))}
          </div>
          <button type="submit" disabled={planning || !goal.trim() || blockedByWorkspace} className="btn btn-primary">
            <PixelIcon src="./assets/icons/goal.png" size={20} />
            {planning ? t('goal.planning', { name: commanderName }) : t('goal.submit')}
          </button>
        </div>
      </form>

      {usesWorkspace && workspace && (
        blockedByWorkspace ? (
          <div className="flex flex-wrap items-center gap-2 px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm text-lantern-deep">
            <span className="flex-[1_1_300px]">{t('goal.noWorkspace')}</span>
            <button
              type="button"
              onClick={() => {
                setPage('settings');
                // The folder section sits below the provider list, so go straight to it
                setTimeout(() => document.getElementById('workspace')?.scrollIntoView({ block: 'center' }), 100);
              }}
              className="font-semibold underline"
            >
              {t('goal.chooseWorkspace')}
            </button>
          </div>
        ) : (
          <p className="font-mono text-[13px] text-muted break-all">{t('goal.workspace', { path: workspace.path })}</p>
        )
      )}

      {plannedIds && (
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-panel border border-line">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {commander && <Portrait agentId={commander.id} size={44} />}
              <div>
                <p className="text-[15px] font-semibold">
                  {t('plan.split', { name: commanderName, count: planned.length })}
                </p>
                <p className="text-[13px] text-muted">
                  {started ? t('plan.started') : planned.some(task => task.project) ? t('plan.projectHint') : t('plan.check')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {started ? (
                <>
                  {runId && <button type="button" onClick={toggleStopped} className="btn btn-ghost">{stopped ? t('plan.resume') : t('plan.stop')}</button>}
                  <button type="button" onClick={finish} className="btn btn-ghost">{t('plan.newGoal')}</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={closePlan} className="btn btn-ghost">{t('plan.edit')}</button>
                  <button type="button" onClick={startAll} disabled={planned.length === 0} className="btn btn-primary">{t('plan.startAll')}</button>
                </>
              )}
            </div>
          </div>

          {planError && (
            <div className="flex flex-wrap items-center gap-2 px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm text-lantern-deep">
              <span className="flex-[1_1_300px] break-words">{t('plan.aiFailed', { error: planError })}</span>
              <button type="button" onClick={() => setPage('settings')} className="font-semibold underline">{t('nav.settings')}</button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {planned.map(task => {
              const worker = agents.find(a => a.id === task.assignedAgentId);
              const role = worker ? ROLE_DEFINITIONS[worker.role] : undefined;
              const after = task.dependencies.map(id => tasks.find(other => other.id === id)?.title).filter(Boolean);
              return (
                <div key={task.id} className="flex flex-col gap-1.5 px-3 py-2.5 bg-white border border-line rounded-lg">
                  <div className="flex flex-wrap items-center gap-3">
                    {role && <PixelIcon src={role.icon} size={24} />}
                    <span className="flex-[1_1_200px] text-[15px] font-medium break-words">{task.title}</span>
                    <span className="text-[13px] text-muted">
                      {worker ? `${firstName(worker)} · ${roleName(worker.role)}` : t('plan.noOwner')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 min-w-[76px] text-[13px]">
                      <Lamp kind={task.lastError ? 'bad' : TASK_LAMPS[task.status]} />
                      {task.lastError ? t('plan.failed') : taskLabel(task.status)}
                    </span>
                  </div>
                  {(after.length > 0 || task.checkpoint) && (
                    <p className="text-[13px] text-muted break-words">
                      {[task.checkpoint ? t('plan.checkpoint') : '', after.length > 0 ? t('plan.after', { list: after.join(', ') }) : ''].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {task.lastError && <p className="text-[13px] text-bad break-words">{task.lastError}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

const CrewCard: React.FC<{ agent: Agent }> = ({ agent }) => {
  const { openAgent, minecraftBots } = useAppStore();
  const info = describeAgent(agent, minecraftBots.find(b => b.agentId === agent.id));
  const role = ROLE_DEFINITIONS[agent.role];
  return (
    <button onClick={() => openAgent(agent.id)} className="lift w-full flex flex-col gap-2 p-3.5 bg-white border border-line-strong rounded-xl text-left">
      <Portrait agentId={agent.id} size={48} />
      <span>
        <span className="block text-[15px] font-bold">{firstName(agent)}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <PixelIcon src={role.icon} size={14} />
          {roleName(agent.role)}
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <Lamp kind={info.lamp} />
        {info.status}
      </span>
      <span className="min-h-[38px] text-[13px] leading-snug text-muted break-words line-clamp-3">{info.detail}</span>
    </button>
  );
};

const DEPARTMENTS: { id: Department; label: TranslationKey }[] = [
  { id: 'product', label: 'chart.department.product' },
  { id: 'design', label: 'chart.department.design' },
  { id: 'engineering', label: 'chart.department.engineering' },
  { id: 'quality', label: 'chart.department.quality' },
  { id: 'admin', label: 'chart.department.admin' },
  { id: 'marketing', label: 'chart.department.marketing' },
  { id: 'creative', label: 'chart.department.creative' }
];

const TeamChart: React.FC = () => {
  const { agents, minecraftBots, openAgent, setPage } = useAppStore();
  const commander = agents.find(a => a.role === 'commander');
  const crew = agents.filter(a => ROLE_DEFINITIONS[a.role].tier === 'field');
  // The rail runs from the centre of the first column to the centre of the last, allowing for the 12px gaps
  const columns = Math.max(crew.length, 1);
  const railInset = `calc((100% - ${12 * (columns - 1)}px) / ${2 * columns})`;

  return (
    <section aria-labelledby="team-title" className="card flex-[3_1_560px] min-w-0 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="team-title" className="text-lg">{t('chart.title')}</h2>
        <button onClick={() => setPage('team')} className="text-sm font-semibold text-brand-text">{t('chart.arrange')}</button>
      </div>

      <div className="flex flex-col items-center">
        {commander && (
          <button
            onClick={() => openAgent(commander.id)}
            className="lift flex items-center gap-3 px-4 py-3 min-w-[300px] bg-lantern-tint border-2 border-lantern rounded-xl text-left"
          >
            <Portrait agentId={commander.id} size={56} />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-base font-bold">
                <PixelIcon src={ROLE_DEFINITIONS.commander.icon} size={16} />
                {firstName(commander)}
              </span>
              <span className="text-[13px] font-semibold text-lantern-text">{roleName('commander')}</span>
              <span className="flex items-center gap-1.5 text-[13px]" style={{ color: '#3D4B63' }}>
                <Lamp kind={describeAgent(commander).lamp} />
                {describeAgent(commander).status}
              </span>
            </span>
          </button>
        )}

        {crew.length > 0 && (
          <>
            <div className="w-0.5 h-5" style={{ background: '#19B8D9' }} />
            <div className="relative w-full h-0.5">
              <div className="absolute top-0 h-0.5" style={{ left: railInset, right: railInset, background: '#19B8D9' }} />
            </div>
            <div className="w-full grid gap-3" style={{ gridTemplateColumns: `repeat(${crew.length}, minmax(0, 1fr))` }}>
              {crew.map(agent => (
                <div key={agent.id} className="flex flex-col items-center min-w-0">
                  <div className="w-0.5 h-[18px]" style={{ background: '#19B8D9' }} />
                  <CrewCard agent={agent} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {DEPARTMENTS.map(department => {
        const members = agents.filter(a => ROLE_DEFINITIONS[a.role].department === department.id);
        if (members.length === 0) return null;
        return (
          <div key={department.id} className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-muted">{t(department.label)}</h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {members.map(agent => {
                const info = describeAgent(agent, minecraftBots.find(b => b.agentId === agent.id));
                return (
                  <button key={agent.id} onClick={() => openAgent(agent.id)} className="lift flex items-center gap-2.5 p-2.5 bg-panel border border-line rounded-xl text-left min-w-0">
                    <Portrait agentId={agent.id} size={40} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-bold">
                        <PixelIcon src={ROLE_DEFINITIONS[agent.role].icon} size={14} />
                        {firstName(agent)}
                      </span>
                      <span className="block text-xs leading-snug text-muted break-words">{roleName(agent.role)}</span>
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        <Lamp kind={info.lamp} />
                        <span className="truncate">{info.status}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
};

const ActivityColumn: React.FC = () => {
  const { decisions, agents, events, openReview } = useAppStore();
  const pending = decisions.filter(d => d.status === 'pending');
  const recent = events.slice(-6).reverse();

  return (
    <div className="flex-[2_1_320px] min-w-0 flex flex-col gap-4">
      {pending.length > 0 && (
        <button onClick={() => openReview(pending[0].id)} className="lift flex items-center gap-3 px-4 py-3.5 bg-white border-2 border-brand rounded-[14px] text-left">
          <PixelIcon src="./assets/icons/podium.png" size={32} />
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold">{t('feed.reviewWaiting', { count: pending.length })}</span>
            <span className="block text-[13px] text-muted truncate">{pending[0].title}</span>
          </span>
          <span className="text-sm font-semibold text-brand-text">{t('feed.reviewNow')}</span>
        </button>
      )}

      <section aria-labelledby="feed-title" className="card p-5 flex flex-col gap-3">
        <h2 id="feed-title" className="text-lg">{t('feed.title')}</h2>
        {recent.length === 0 && <p className="text-sm text-muted">{t('feed.empty')}</p>}
        <ul className="flex flex-col">
          {recent.map(event => {
            const agent = agents.find(a => a.id === event.agentId);
            return (
              <li key={`${event.time}-${event.kind}-${event.detail}`} className="flex gap-2.5 py-2.5 border-t" style={{ borderColor: '#EDF1F7' }}>
                <Portrait agentId={event.agentId || 'marlow'} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-normal break-words">
                    {agent && <strong className="font-semibold">{firstName(agent)} </strong>}
                    {eventText(event.kind, event.detail)}
                  </p>
                  <p className="font-mono text-xs text-faint">{new Date(event.time).toLocaleTimeString()}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export const CommandCenter: React.FC = () => (
  <div className="flex flex-col gap-6">
    <GoalComposer />
    <div className="flex flex-wrap items-start gap-6">
      <TeamChart />
      <ActivityColumn />
    </div>
  </div>
);
