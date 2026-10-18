// Kiosk orchestration: the only place that calls the API. Screens are dumb; state lives in the
// session reducer. Every failure is soft — Ralph says "Oops, let's try tapping!" and the child retries.
import { useCallback, useEffect, useReducer, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Complaint as ComplaintId, Lang } from '@ralph/shared';
import { kioskApi } from '../lib/api';
import { initialSession, reducer, type SavedSession } from './session';
import { Welcome } from './screens/Welcome';
import { Language } from './screens/Language';
import { WhoIsHere, type WhoAnswers } from './screens/WhoIsHere';
import { Complaint } from './screens/Complaint';
import { Question } from './screens/Question';
import { ParentConfirm, type ParentSubmit } from './screens/ParentConfirm';
import { Waiting } from './screens/Waiting';
import { WaitingHub } from './screens/WaitingHub';
import { Goodbye } from './screens/Goodbye';
import { FireflyTap } from './games/GameOne';
import { CyberCircuit } from './games/GameTwo';
import { Companion } from './screens/Companion';

const SAVE_KEY = 'ralph.kiosk.session';

function loadSaved(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedSession) : null;
  } catch {
    return null;
  }
}
function save(s: SavedSession | null) {
  try {
    if (s) sessionStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SAVE_KEY);
  } catch {
    /* private mode etc. — a refresh just starts over */
  }
}

function KioskFlow() {
  const { t, i18n } = useTranslation();
  const [s, dispatch] = useReducer(reducer, initialSession);
  const [ageYears, setAgeYears] = useState<number>(7);

  // A refresh while waiting comes back to the waiting screen (same visit).
  useEffect(() => {
    const saved = loadSaved();
    if (saved) dispatch({ type: 'RESUME_WAITING', ...saved });
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(s.lang);
    document.documentElement.lang = s.lang;
  }, [s.lang, i18n]);

  /** Run an API call with busy/error handling; returns undefined on failure. */
  const call = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    dispatch({ type: 'REQUEST' });
    try {
      return await fn();
    } catch {
      dispatch({ type: 'FAILED' });
      return undefined;
    }
  }, []);

  const createVisit = async (w: WhoAnswers) => {
    setAgeYears(w.age_years);
    const r = await call(() => kioskApi.createVisit({ ...w, language: s.lang }));
    if (r) {
      dispatch({
        type: 'VISIT_CREATED',
        visitId: r.visit_id,
        childName: w.first_name,
        parentMode: r.parent_mode,
      });
    }
  };

  const pickComplaint = async (complaint: ComplaintId) => {
    const r = await call(() => kioskApi.setComplaint(s.visitId!, complaint));
    if (r) dispatch({ type: 'COMPLAINT_SET', complaint, node: r.node });
  };

  const answer = async (value: unknown) => {
    if (!s.node) return;
    const body = value === null ? { node_id: s.node.id, skip: true } : { node_id: s.node.id, value };
    const r = await call(() => kioskApi.answer(s.visitId!, body));
    if (r) dispatch({ type: 'ANSWERED', value, next: r.next, reply: r.reply });
  };

  const parentConfirm = async (p: ParentSubmit) => {
    const r = await call(() => kioskApi.parentConfirm(s.visitId!, p));
    if (r) {
      save({ visitId: s.visitId!, lang: s.lang, childName: s.childName, parentMode: s.parentMode });
      dispatch({ type: 'PARENT_DONE' });
    }
  };

  const skipToWaitingDemo = () => {
    dispatch({
      type: 'RESUME_WAITING',
      visitId: 'demo',
      lang: s.lang,
      childName: s.childName || 'Maya',
      parentMode: false,
    });
  };

  const replyDone = useCallback(() => dispatch({ type: 'REPLY_DONE' }), []);
  const calledIn = useCallback(() => dispatch({ type: 'CALLED_IN' }), []);
  const reset = () => (save(null), dispatch({ type: 'RESET' }));

  const subline = s.parentMode ? t('parentMode', { name: s.childName }) : undefined;

  return (
    <div className="min-h-full bg-bg">
      {s.step === 'welcome' && (
        <Welcome onStart={() => dispatch({ type: 'START' })} onSkipToWaiting={skipToWaitingDemo} />
      )}
      {s.step === 'language' && (
        <Language onPick={(lang: Lang) => dispatch({ type: 'SET_LANG', lang })} />
      )}
      {s.step === 'who' && <WhoIsHere onSubmit={createVisit} busy={s.busy} error={s.error} />}
      {s.step === 'complaint' && (
        <Complaint onPick={pickComplaint} busy={s.busy} error={s.error} subline={subline} />
      )}
      {s.step === 'question' && s.node && (
        <Question
          node={s.node}
          lang={s.lang}
          reply={s.reply}
          onReplyDone={replyDone}
          onAnswer={answer}
          busy={s.busy}
          error={s.error}
          subline={subline}
        />
      )}
      {s.step === 'parent' && (
        <ParentConfirm
          answered={s.answered}
          childName={s.childName}
          onSubmit={parentConfirm}
          busy={s.busy}
          error={s.error}
        />
      )}
      {s.step === 'waiting' && s.visitId && (
        <Waiting
          visitId={s.visitId}
          childName={s.childName}
          ageYears={ageYears}
          lang={s.lang}
          onCalledIn={calledIn}
        />
      )}
      {s.step === 'goodbye' && <Goodbye childName={s.childName} onDone={reset} />}
    </div>
  );
}

export function KioskApp() {
  return (
    <main className="min-h-full bg-bg">
      <Routes>
        <Route path="waiting" element={<WaitingHub />} />
        <Route path="games/firefly" element={<FireflyTap />} />
        <Route path="games/cyber" element={<CyberCircuit />} />
        <Route path="companion" element={<Companion />} />
        <Route path="*" element={<KioskFlow />} />
      </Routes>
    </main>
  );
}
