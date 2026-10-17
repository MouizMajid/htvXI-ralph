import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { YES_NO, type ParentAnswers, type YesNo } from '@ralph/shared';
import { Shell } from '../components/Shell';
import { BigButton } from '../components/BigButton';
import { AnswerInput } from '../components/AnswerInput';
import { answerText, questionText } from '../format';
import type { AnsweredQuestion } from '../session';

export interface ParentSubmit {
  answers: ParentAnswers;
  edits: { node_id: string; value: unknown }[];
}

const ONSET = ['today', '1_2_days', 'more_than_2_days', 'not_sure'] as const;
const field = 'w-full rounded-card border-2 border-unsure bg-surface px-4 py-3 text-xl outline-none focus:border-secondary';

function Pills<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value?: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`min-h-12 rounded-pill px-4 text-lg font-bold ${value === o ? 'bg-secondary text-on-secondary' : 'bg-surface'}`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/** Grown-up checks the child's answers, fixes any, and adds what a child can't know. Never shows alerts. */
export function ParentConfirm({
  answered,
  childName,
  onSubmit,
  busy,
  error,
}: {
  answered: AnsweredQuestion[];
  childName: string;
  onSubmit: (p: ParentSubmit) => void;
  busy: boolean;
  error: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [a, setA] = useState<ParentAnswers>({});
  const [temp, setTemp] = useState('');

  const set = <K extends keyof ParentAnswers>(k: K, v: ParentAnswers[K]) => setA((prev) => ({ ...prev, [k]: v }));
  const yesNo = (k: 'keeps_fluids_down' | 'peed_recently' | 'very_sleepy' | 'rash', labelKey: string) => (
    <div className="flex flex-col gap-2">
      <span className="text-lg font-semibold">{t(labelKey)}</span>
      <Pills<YesNo> options={YES_NO} value={a[k]} onChange={(v) => set(k, v)} label={(v) => t(`answers.${v}`)} />
    </div>
  );

  const submit = () => {
    const tempNum = Number(temp);
    const answers: ParentAnswers = {
      ...a,
      max_temp_c: temp && tempNum >= 30 && tempNum <= 45 ? tempNum : undefined,
    };
    // Drop empty strings so the API only gets what the parent actually filled in.
    for (const k of Object.keys(answers) as (keyof ParentAnswers)[]) {
      if (answers[k] === '' || answers[k] === undefined) delete answers[k];
    }
    onSubmit({ answers, edits: Object.entries(edits).map(([node_id, value]) => ({ node_id, value })) });
  };

  return (
    <Shell pose="idle" line={t('parent.title', { name: childName })} error={error}>
      <ul className="flex flex-col gap-2">
        {answered.map(({ node, value }) => {
          const edited = node.id in edits;
          const shown = edited ? edits[node.id] : value;
          return (
            <li key={node.id} className="rounded-card bg-surface p-4 shadow-soft">
              <p className="text-base text-ink-muted">{questionText(t, node)}</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xl font-bold">
                  {answerText(t, node, shown)}
                  {edited && <span className="ml-2 text-base font-semibold text-secondary">({t('parent.edited')})</span>}
                </p>
                <button type="button" onClick={() => setEditing(editing === node.id ? null : node.id)} className="min-h-12 rounded-pill bg-bg px-4 text-lg font-bold">
                  {t('parent.change')}
                </button>
              </div>
              {editing === node.id && (
                <div className="mt-3 flex flex-col gap-3">
                  <AnswerInput
                    node={node}
                    onAnswer={(v) => {
                      if (v !== null) setEdits((prev) => ({ ...prev, [node.id]: v }));
                      setEditing(null);
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="mt-4 text-2xl font-extrabold">{t('parent.more')}</h2>
      <div className="flex flex-col gap-2">
        <span className="text-lg font-semibold">{t('parent.onset')}</span>
        <Pills options={ONSET} value={a.onset} onChange={(v) => set('onset', v)} label={(v) => t(`parent.onsetOptions.${v}`)} />
      </div>
      <label className="flex flex-col gap-1 text-lg font-semibold">
        {t('parent.maxTemp')}
        <input className={field} value={temp} onChange={(e) => setTemp(e.target.value)} type="number" inputMode="decimal" step={0.1} min={30} max={45} />
      </label>
      <label className="flex flex-col gap-1 text-lg font-semibold">
        {t('parent.meds')}
        <input className={field} value={a.meds_given ?? ''} onChange={(e) => set('meds_given', e.target.value)} maxLength={300} />
      </label>
      {yesNo('keeps_fluids_down', 'parent.fluids')}
      {yesNo('peed_recently', 'parent.peed')}
      {yesNo('very_sleepy', 'parent.sleepy')}
      {yesNo('rash', 'parent.rash')}
      <label className="flex flex-col gap-1 text-lg font-semibold">
        {t('parent.conditions')}
        <input className={field} value={a.conditions ?? ''} onChange={(e) => set('conditions', e.target.value)} maxLength={300} />
      </label>
      <label className="flex flex-col gap-1 text-lg font-semibold">
        {t('parent.notes')}
        <textarea className={field} rows={3} value={a.notes ?? ''} onChange={(e) => set('notes', e.target.value)} maxLength={1000} />
      </label>
      <BigButton tone="primary" disabled={busy} onClick={submit} className="mt-2 mb-6">
        {t('parent.submit')}
      </BigButton>
    </Shell>
  );
}
