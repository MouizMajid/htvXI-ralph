import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CHECKIN_ANSWER_TIMEOUT_MS, type Feeling, type Lang } from '@ralph/shared';
import { kioskApi } from '../../lib/api';
import { speak } from '../../lib/speech';
import { Ralph } from './Ralph';
import { BigButton } from './BigButton';
import { FacesScale } from './FacesScale';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  visitId: string;
  lang: Lang;
  /** Called once the answer (or "no response") is saved — the server then schedules the next one. */
  onDone: () => void;
}

/**
 * Ralph's check-in: "How are you feeling now?" → better / same / worse, then (optionally) a
 * face. The ONLY place check-ins are recorded — always the child's own taps. Unanswered after
 * a minute → `no_response` (two in a row raise the staff "not responding" alert).
 */
export function CheckinPrompt({ visitId, lang, onDone }: Props) {
  const { t } = useTranslation();
  const [feeling, setFeeling] = useState<Exclude<Feeling, 'no_response'> | null>(null);
  const savedRef = useRef(false);

  const save = async (f: Feeling, painFace: number | null) => {
    if (savedRef.current) return;
    savedRef.current = true;
    // Preview routes (/kiosk/waiting) use a fake visit id — nothing to save.
    if (UUID_RE.test(visitId)) {
      try {
        await kioskApi.checkin(visitId, { feeling: f, pain_face: painFace });
      } catch {
        /* fail soft: the next check-in still comes */
      }
    }
    onDone();
  };

  // Ralph asks each step out loud once.
  const asking = feeling === null ? t('checkin.ask') : t('checkin.face');
  useEffect(() => speak(asking, lang, () => {}), [asking, lang]);

  // No answer in time → record it, so a child who stops responding gets noticed.
  useEffect(() => {
    const id = setTimeout(() => void save('no_response', null), CHECKIN_ANSWER_TIMEOUT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('checkin.ask')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    >
      <div className="flex w-full max-w-xl flex-col items-center gap-4 rounded-card bg-surface p-6 text-center shadow-soft">
        <Ralph pose="gentle" className="size-32" />
        {feeling === null ? (
          <>
            <h2 className="text-3xl font-extrabold text-ink">{t('checkin.ask')}</h2>
            <div className="grid w-full gap-3">
              <BigButton tone="yes" onClick={() => setFeeling('better')}>
                😊 {t('checkin.better')}
              </BigButton>
              <BigButton tone="secondary" onClick={() => setFeeling('same')}>
                😐 {t('checkin.same')}
              </BigButton>
              <BigButton tone="no" onClick={() => setFeeling('worse')}>
                😣 {t('checkin.worse')}
              </BigButton>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-extrabold text-ink">{t('checkin.face')}</h2>
            <div className="w-full">
              <FacesScale onPick={(n) => void save(feeling, n)} />
            </div>
            <button
              type="button"
              onClick={() => void save(feeling, null)}
              className="min-h-12 rounded-pill bg-bg px-6 text-lg font-bold text-ink-muted"
            >
              {t('checkin.skipFace')}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
