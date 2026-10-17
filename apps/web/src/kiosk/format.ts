import type { TFunction } from 'i18next';
import type { NodeView } from '@ralph/shared';

/** The question in the session language; English source text until translations exist. */
export function questionText(t: TFunction, node: NodeView): string {
  return t(`q.${node.tree}.${node.id}`, { defaultValue: node.ask });
}

/** Human-readable answer for the parent-confirm screen. */
export function answerText(t: TFunction, node: NodeView, value: unknown): string {
  if (value === null || value === undefined) return t('parent.skipped');
  switch (node.answer_type) {
    case 'yes_no':
      return t(`answers.${String(value)}`);
    case 'choice':
      return t(`options.${String(value)}`, { defaultValue: String(value) });
    case 'body_map':
      return t(`regions.${String(value)}`);
    case 'faces':
      return `${t(`faces.${String(value)}`)} (${String(value)}/5)`;
    case 'number':
      return node.max && value === node.max ? t('number.orMore', { n: value }) : String(value);
    case 'free_speech':
      return `“${String(value)}”`;
  }
}
