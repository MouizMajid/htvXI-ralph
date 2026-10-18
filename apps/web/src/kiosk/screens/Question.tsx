import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SAFEGUARDING_REPLY, type Lang, type NodeView, type ReplyKey } from '@ralph/shared';
import { Shell } from '../components/Shell';
import { AnswerInput } from '../components/AnswerInput';
import { TalkButton } from '../components/TalkButton';
import { questionText } from '../format';
import { speak } from '../../lib/speech';

/** A reaction stays on screen at least this long, and at most this long if speech never ends. */
const REPLY_MIN_MS = 900;
const REPLY_MAX_MS = 9000;

/** Which "can you tap instead?" line fits the question (keys under talk.tryTapping). */
const TAP_HINT: Partial<Record<NodeView['answer_type'], string>> = { body_map: 'body_map', faces: 'faces' };

interface Props {
  node: NodeView;
  lang: Lang;
  reply: ReplyKey | null;
  /** Ralph's own reaction to a spoken answer (else the fixed "Thank you!"). */
  line: string | null;
  /** What we heard the child say, shown back to them. */
  heard: string | null;
  onReplyDone: () => void;
  onAnswer: (value: unknown) => void;
  onSpoken: (audio: Blob) => Promise<void>;
  busy: boolean;
  error: boolean;
  subline?: string;
}

export function Question({ node, lang, reply, line, heard, onReplyDone, onAnswer, onSpoken, busy, error, subline }: Props) {
  const { t } = useTranslation();
  const [listening, setListening] = useState(false);
  const asked = questionText(t, node);

  const replyText =
    reply === 'safeguarding_reply'
      ? SAFEGUARDING_REPLY[lang]
      : reply === 'try_tapping'
        ? t(`talk.tryTapping.${TAP_HINT[node.answer_type] ?? 'other'}`)
        : reply === 'not_heard'
          ? t('talk.notHeard')
          : reply === 'thanks'
            ? (line ?? t('ralph.thanks'))
            : null;

  // Ralph says his reaction, then we move on once he's done (min/max bounds keep the pace sane).
  const doneRef = useRef(onReplyDone);
  doneRef.current = onReplyDone;
  useEffect(() => {
    if (!replyText) return;
    const shownAt = Date.now();
    let spoken = false;
    let minTimer: ReturnType<typeof setTimeout> | undefined;
    const advance = () => {
      if (spoken) return;
      spoken = true;
      minTimer = setTimeout(() => doneRef.current(), Math.max(0, REPLY_MIN_MS - (Date.now() - shownAt)));
    };
    const cancel = speak(replyText, lang, advance);
    const maxTimer = setTimeout(advance, REPLY_MAX_MS);
    return () => {
      cancel();
      clearTimeout(maxTimer);
      clearTimeout(minTimer);
    };
  }, [replyText, lang]);

  // Ralph reads each new question aloud.
  useEffect(() => {
    if (replyText) return;
    return speak(asked, lang, () => {});
  }, [asked, lang, replyText]);

  if (replyText) {
    // The safeguarding line stays neutral: nothing else on screen hints that anything was flagged.
    const showHeard = heard && reply !== 'safeguarding_reply';
    return (
      <Shell
        pose={reply === 'safeguarding_reply' ? 'gentle' : reply === 'try_tapping' || reply === 'not_heard' ? 'think' : 'happy'}
        line={replyText}
        subline={showHeard ? t('talk.heard', { text: heard }) : undefined}
      />
    );
  }

  return (
    <Shell
      pose={busy ? 'think' : listening ? 'listen' : 'idle'}
      line={asked}
      subline={subline}
      error={error}
      onReplay={() => speak(asked, lang, () => {})}
    >
      <TalkButton key={`talk-${node.id}`} onAudio={onSpoken} onListeningChange={setListening} disabled={busy} />
      {/* key: reset local input state (e.g. body-map selection) between questions */}
      <AnswerInput key={node.id} node={node} onAnswer={onAnswer} disabled={busy || listening} />
    </Shell>
  );
}
