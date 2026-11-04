import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { ChevronLeft } from 'lucide-react';
import { t } from '@shared/i18n';
import { firstName, PixelIcon, Portrait } from '../components/ui';

interface DiffFile {
  name: string;
  added: number;
  removed: number;
  lines: string[];
}

const DIFF_METADATA = /^(index |new file|deleted file|old mode|new mode|similarity |dissimilarity |rename |copy |--- |\+\+\+ )/;

/** Splits a real `git diff` into one section per file. */
function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let inHeader = false;

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const fromHeader = line.match(/ b\/(.+)$/);
      current = { name: fromHeader ? fromHeader[1] : line, added: 0, removed: 0, lines: [] };
      files.push(current);
      inHeader = true;
      continue;
    }
    if (!current) continue;

    if (inHeader) {
      if (line.startsWith('@@')) {
        inHeader = false;
      } else {
        if (!DIFF_METADATA.test(line) && line.trim()) current.lines.push(line);
        continue;
      }
    }

    if (line.startsWith('+')) current.added++;
    if (line.startsWith('-')) current.removed++;
    current.lines.push(line);
  }
  return files;
}

const lineStyle = (line: string): React.CSSProperties => {
  if (line.startsWith('+')) return { background: '#E3F4EA' };
  if (line.startsWith('-')) return { background: '#FDE9E7' };
  if (line.startsWith('@@')) return { background: '#F3F6FB', color: '#48566E' };
  return { background: '#fff' };
};

const FileDiff: React.FC<{ file: DiffFile }> = ({ file }) => (
  <section aria-label={t('review.fileChanges', { file: file.name })} className="card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-3 bg-panel border-b border-line">
      <code className="font-mono text-sm font-medium break-all">{file.name}</code>
      <span className="font-mono text-[13px] font-medium" style={{ color: '#3D4B63' }}>
        +{file.added}  −{file.removed}
      </span>
    </div>
    <div className="overflow-auto max-h-[480px] py-2 select-text">
      {file.lines.map((line, index) => {
        const isChange = line.startsWith('+') || line.startsWith('-');
        return (
          <div key={index} className="diff-line" style={lineStyle(line)}>
            <span className="w-3 shrink-0 font-medium" style={{ color: '#3D4B63' }} aria-hidden="true">
              {line.startsWith('+') ? '+' : line.startsWith('-') ? '−' : ''}
            </span>
            <span>{isChange || line.startsWith(' ') ? line.slice(1) : line}</span>
          </div>
        );
      })}
      {file.lines.length === 0 && <p className="px-3.5 py-2 text-sm text-muted">{t('review.noContent')}</p>}
    </div>
  </section>
);

export const Review: React.FC = () => {
  const { decisions, reviewDecisionId, agents, tasks, answerDecision, setPage } = useAppStore();
  const [note, setNote] = useState('');
  const [verdict, setVerdict] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const decision =
    decisions.find(d => d.id === reviewDecisionId) || decisions.find(d => d.status === 'pending');
  const agent = agents.find(a => a.id === decision?.agentId);
  const task = tasks.find(t => t.id === decision?.taskId);

  const backButton = (
    <button onClick={() => setPage('tasks')} className="inline-flex items-center gap-1.5 min-h-[44px] self-start text-sm font-semibold text-brand-text">
      <ChevronLeft className="w-4 h-4" />
      {t('review.back')}
    </button>
  );

  if (!decision) {
    return (
      <div className="flex flex-col gap-5">
        {backButton}
        <p className="card p-6 text-[15px] text-muted">{t('review.none')}</p>
      </div>
    );
  }

  if (decision.type === 'approval') {
    const answered = decision.status !== 'pending';
    const answer = async (approved: boolean) => {
      if (!approved && !note.trim()) {
        setError(t('approval.noteRequired'));
        return;
      }
      setBusy(true);
      setError(null);
      const result = await answerDecision(decision.id, approved, approved ? undefined : note.trim());
      setBusy(false);
      if (!result.ok) setError(result.error || t('review.failed'));
      else setNote('');
    };
    return (
      <div className="flex flex-col gap-5 max-w-[860px]">
        {backButton}
        <header className="flex items-center gap-4">
          {agent ? <Portrait agentId={agent.id} size={56} /> : <PixelIcon src="./assets/icons/podium.png" size={48} />}
          <div className="min-w-0">
            <h1 className="text-[28px] leading-tight font-bold">{t('approval.title')}</h1>
            <p className="mt-1 text-[15px] text-muted">{t('approval.body', { name: agent ? firstName(agent) : decision.agentId })}</p>
          </div>
        </header>
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="text-lg break-words">{decision.title}</h2>
          <div className="p-4 rounded-lg bg-panel text-[15px] leading-relaxed whitespace-pre-wrap break-words overflow-auto max-h-[480px] select-text">{decision.document}</div>
          {answered ? (
            <p role="status" className="text-sm font-medium text-good">{t('approval.answered')}</p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('approval.note')}
                <textarea className="field" rows={3} value={note} onChange={e => setNote(e.target.value)} />
              </label>
              {error && <p role="alert" className="px-3 py-2.5 rounded-lg bg-bad-tint border border-bad-edge text-[13px] text-bad break-words">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => answer(true)} disabled={busy} className="btn btn-primary">{t('approval.approve')}</button>
                <button onClick={() => answer(false)} disabled={busy} className="btn btn-ghost">{t('approval.sendBack')}</button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  if (decision.type === 'permission') {
    const answered = decision.status !== 'pending';
    const answer = async (approved: boolean, kind?: string) => {
      setBusy(true);
      const result = await answerDecision(decision.id, approved, kind);
      setBusy(false);
      if (!result.ok) setError(result.error || t('review.failed'));
    };
    return (
      <div className="flex flex-col gap-5 max-w-[860px]">
        {backButton}
        <header className="flex items-center gap-4">
          <PixelIcon src="./assets/icons/podium.png" size={48} />
          <div className="min-w-0">
            <h1 className="text-[28px] leading-tight font-bold">{t('permission.title')}</h1>
            <p className="mt-1 text-[15px] text-muted">{t('permission.body', { name: agent ? firstName(agent) : decision.agentId })}</p>
          </div>
        </header>
        <section className="card p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold">{t('permission.tool')}</p>
          <code className="font-mono text-sm break-all select-text">{decision.toolCall?.tool}</code>
          <p className="text-sm leading-relaxed text-muted break-words">{decision.prompt}</p>
          <p className="text-sm font-semibold">{t('permission.args')}</p>
          <pre className="p-3 rounded-lg bg-panel font-mono text-[13px] overflow-auto max-h-[320px] select-text">{decision.toolCall?.args}</pre>
          {error && <p role="alert" className="px-3 py-2.5 rounded-lg bg-bad-tint border border-bad-edge text-[13px] text-bad break-words">{error}</p>}
          {answered ? (
            <p role="status" className="text-sm font-medium text-good">{t('permission.answered')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => answer(true, 'once')} disabled={busy} className="btn btn-primary">{t('permission.once')}</button>
              <button onClick={() => answer(true, 'always')} disabled={busy} className="btn btn-ghost">{t('permission.always')}</button>
              <button onClick={() => answer(false)} disabled={busy} className="btn btn-ghost">{t('permission.reject')}</button>
            </div>
          )}
        </section>
      </div>
    );
  }

  const files = parseDiff(decision.diffContent || '');
  const name = agent ? firstName(agent) : decision.agentId;

  const decide = async (approved: boolean) => {
    setBusy(true);
    setError(null);
    const result = await answerDecision(decision.id, approved, note.trim() || undefined);
    setBusy(false);
    if (result.ok) setVerdict(approved ? 'approved' : 'rejected');
    else setError(result.error || t('review.failed'));
  };

  return (
    <div className="flex flex-col gap-5">
      {backButton}

      <header className="flex flex-wrap items-center gap-4">
        <PixelIcon src="./assets/icons/podium.png" size={48} />
        <div className="flex-[1_1_320px] min-w-0">
          <h1 className="text-[28px] leading-tight font-bold break-words">{task?.title || decision.title}</h1>
          <p className="mt-1 text-[15px] leading-relaxed break-words">{decision.prompt}</p>
          <p className="flex items-center gap-2 mt-1 text-[15px] text-muted">
            {agent && <Portrait agentId={agent.id} size={28} />}
            {t('review.changedFiles', { name, count: files.length })}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex-[3_1_560px] min-w-0 flex flex-col gap-3">
          {!!decision.autoRunFiles?.length && (
            <div role="note" className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm leading-relaxed text-lantern-deep">
              <strong className="font-semibold">{t('review.autoRunTitle')}</strong> {t('review.autoRunBody')}
              <span className="font-mono break-all"> {decision.autoRunFiles.join(', ')}</span>
            </div>
          )}
          {decision.diffTruncated && (
            <p className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm text-lantern-deep">
              {t('review.truncated')} <code className="font-mono">{task?.worktreeBranch}</code>
            </p>
          )}
          {files.map(file => (
            <FileDiff key={file.name} file={file} />
          ))}
        </div>

        <aside className="card flex-[1_1_300px] min-w-0 flex flex-col gap-3.5 p-5">
          {verdict ? (
            <div role="status" className="flex flex-col gap-3">
              <h2 className="text-lg">{verdict === 'approved' ? t('review.merged') : t('review.sentBack', { name })}</h2>
              <p className="text-sm leading-relaxed text-muted">
                {verdict === 'approved' ? t('review.mergedBody') : t('review.sentBackBody')}
              </p>
              <button onClick={() => setPage('tasks')} className="btn btn-primary">{t('review.back')}</button>
            </div>
          ) : decision.status !== 'pending' ? (
            <p className="text-sm text-muted">{t('review.alreadyDecided')}</p>
          ) : (
            <>
              <h2 className="text-lg">{t('review.verdict')}</h2>
              <p className="text-[13px] leading-relaxed text-muted">{t('review.notRun')}</p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="note" className="text-sm font-medium">{t('review.noteLabel', { name })}</label>
                <textarea
                  id="note"
                  rows={4}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('review.notePlaceholder')}
                  className="w-full px-3 py-2.5 rounded-lg bg-white text-[15px] leading-relaxed resize-y placeholder:text-faint"
                  style={{ border: '2px solid #C6D1E1' }}
                />
              </div>
              {error && <p role="alert" className="px-3 py-2.5 rounded-lg bg-bad-tint border border-bad-edge text-[13px] leading-relaxed text-bad break-words">{error}</p>}
              <button onClick={() => decide(true)} disabled={busy} className="btn btn-primary">{busy ? t('common.loading') : t('review.approve')}</button>
              <button onClick={() => decide(false)} disabled={busy} className="btn btn-ghost">{t('review.sendBack')}</button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};
