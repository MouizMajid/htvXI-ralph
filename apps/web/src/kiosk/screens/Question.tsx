import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SAFEGUARDING_REPLY, type Lang, type NodeView, type ReplyKey } from '@ralph/shared';
import { Shell } from '../components/Shell';
import { AnswerInput } from '../components/AnswerInput';
import { questionText } from '../format';

/** How long Ralph's reaction shows before the next question. */
const REPLY_MS: Record<ReplyKey, number> = { thanks: 900, safeguarding_reply: 4500 };

interface Props {
  node: NodeView;
  lang: Lang;
  reply: ReplyKey | null;
  onReplyDone: () => void;
  onAnswer: (value: unknown) => void;
  busy: boolean;
  error: boolean;
  subline?: string;
}

export function Question({ node, lang, reply, onReplyDone, onAnswer, busy, error, subline }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!reply) return;
    const id = setTimeout(onReplyDone, REPLY_MS[reply]);
    return () => clearTimeout(id);
  }, [reply, onReplyDone]);

  // Ralph's reaction to the previous answer. The safeguarding line is fixed + pre-translated,
  // and nothing else on screen hints that anything was flagged.
  if (reply === 'safeguarding_reply') return <Shell pose="gentle" line={SAFEGUARDING_REPLY[lang]} />;
  if (reply === 'thanks') return <Shell pose="happy" line={t('ralph.thanks')} />;

  return (
    <Shell pose={busy ? 'think' : 'listen'} line={questionText(t, node)} subline={subline} error={error}>
      {/* key: reset local input state (e.g. body-map selection) between questions */}
      <AnswerInput key={node.id} node={node} onAnswer={onAnswer} disabled={busy} />
    </Shell>
  );
}
