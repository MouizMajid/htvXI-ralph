import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { YES_NO, type NodeView } from '@ralph/shared';
import { BigButton } from './BigButton';
import { BodyMap } from './BodyMap';
import { FacesScale } from './FacesScale';
import { Icon } from './Icon';

interface Props {
  node: NodeView;
  /** `null` = skipped (free speech only). */
  onAnswer: (value: unknown) => void;
  disabled?: boolean;
}

const YES_NO_STYLE = {
  yes: { tone: 'yes', icon: 'yes', fallback: '👍' },
  no: { tone: 'no', icon: 'no', fallback: '👎' },
  not_sure: { tone: 'unsure', icon: 'not-sure', fallback: '🤷' },
} as const;

/** The tap fallback for every question type (rule 4: voice is optional). */
export function AnswerInput({ node, onAnswer, disabled }: Props) {
  const { t } = useTranslation();

  switch (node.answer_type) {
    case 'yes_no':
      return (
        <>
          {YES_NO.map((v) => (
            <BigButton
              key={v}
              tone={YES_NO_STYLE[v].tone}
              disabled={disabled}
              icon={<Icon name={YES_NO_STYLE[v].icon} fallback={YES_NO_STYLE[v].fallback} className="size-10" />}
              onClick={() => onAnswer(v)}
            >
              {t(`answers.${v}`)}
            </BigButton>
          ))}
        </>
      );
    case 'choice':
      return (
        <>
          {node.options?.map((o) => (
            <BigButton key={o} disabled={disabled} onClick={() => onAnswer(o)}>
              {t(`options.${o}`, { defaultValue: o })}
            </BigButton>
          ))}
        </>
      );
    case 'body_map':
      return <BodyMap onPick={onAnswer} disabled={disabled} />;
    case 'faces':
      return <FacesScale onPick={onAnswer} disabled={disabled} />;
    case 'number':
      return <NumberPick max={node.max ?? 5} onPick={onAnswer} disabled={disabled} />;
    case 'free_speech':
      return <FreeText onSubmit={onAnswer} disabled={disabled} />;
  }
}

function NumberPick({ max, onPick, disabled }: { max: number; onPick: (n: number) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <BigButton key={n} disabled={disabled} onClick={() => onPick(n)} className={n === max ? 'col-span-2 text-xl' : ''}>
          {n === max ? t('number.orMore', { n }) : n}
        </BigButton>
      ))}
    </div>
  );
}

/** Tier 1: a grown-up types what the child says (voice arrives in slice 6), or skips. */
function FreeText({ onSubmit, disabled }: { onSubmit: (v: string | null) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder={t('freeText.placeholder')}
        className="w-full rounded-card border-2 border-unsure bg-surface p-4 text-xl outline-none focus:border-secondary"
      />
      <div className="grid grid-cols-2 gap-3">
        <BigButton tone="unsure" disabled={disabled} onClick={() => onSubmit(null)}>
          {t('freeText.skip')}
        </BigButton>
        <BigButton tone="primary" disabled={disabled || !text.trim()} onClick={() => onSubmit(text.trim())}>
          {t('freeText.next')}
        </BigButton>
      </div>
    </>
  );
}
