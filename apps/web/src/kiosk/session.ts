// Kiosk flow state: one pure reducer per session (no React, no fetch — tested in session.test.ts).
// KioskApp.tsx performs the API calls and dispatches the results here.
import type { Complaint, Lang, NodeView, ReplyKey } from '@ralph/shared';

export type Step =
  | 'welcome'
  | 'language'
  | 'who'
  | 'complaint'
  | 'question'
  | 'parent'
  | 'waiting'
  | 'goodbye';

export interface AnsweredQuestion {
  node: NodeView;
  /** null = skipped */
  value: unknown;
}

export interface Session {
  step: Step;
  lang: Lang;
  visitId: string | null;
  childName: string;
  parentMode: boolean;
  complaint: Complaint | null;
  node: NodeView | null;
  answered: AnsweredQuestion[];
  /** Ralph's reaction to the last answer, shown briefly before the next question. */
  reply: ReplyKey | null;
  /** Ralph's own words for that reaction (spoken answers), instead of the fixed line. */
  line: string | null;
  /** What we heard the child say (spoken answers), shown back to them. */
  heard: string | null;
  busy: boolean;
  /** Fail soft: shown as "Oops, let's try tapping!" — the child just taps again. */
  error: boolean;
}

export type Action =
  | { type: 'START' }
  | { type: 'SET_LANG'; lang: Lang }
  | { type: 'REQUEST' }
  | { type: 'FAILED' }
  | { type: 'VISIT_CREATED'; visitId: string; childName: string; parentMode: boolean }
  | { type: 'COMPLAINT_SET'; complaint: Complaint; node: NodeView }
  | { type: 'ANSWERED'; value: unknown; next: NodeView | null; reply: ReplyKey; line?: string | null; heard?: string | null }
  | { type: 'HEARD_UNCLEAR'; heard: string | null; reply: ReplyKey }
  | { type: 'REPLY_DONE' }
  | { type: 'PARENT_DONE' }
  | { type: 'CALLED_IN' }
  | { type: 'RESUME_WAITING'; visitId: string; lang: Lang; childName: string; parentMode: boolean }
  | { type: 'RESET' };

export const initialSession: Session = {
  step: 'welcome',
  lang: 'en',
  visitId: null,
  childName: '',
  parentMode: false,
  complaint: null,
  node: null,
  answered: [],
  reply: null,
  line: null,
  heard: null,
  busy: false,
  error: false,
};

export function reducer(s: Session, a: Action): Session {
  switch (a.type) {
    case 'START':
      return { ...s, step: 'language' };
    case 'SET_LANG':
      return { ...s, lang: a.lang, step: 'who' };
    case 'REQUEST':
      return { ...s, busy: true, error: false };
    case 'FAILED':
      return { ...s, busy: false, error: true };
    case 'VISIT_CREATED':
      return {
        ...s,
        busy: false,
        visitId: a.visitId,
        childName: a.childName,
        parentMode: a.parentMode,
        step: 'complaint',
      };
    case 'COMPLAINT_SET':
      return { ...s, busy: false, complaint: a.complaint, node: a.node, answered: [], step: 'question' };
    case 'ANSWERED': {
      if (!s.node) return s;
      const answered = [...s.answered, { node: s.node, value: a.value }];
      // End of tree → parent confirms. Otherwise next question (after Ralph's short reaction).
      return {
        ...s,
        busy: false,
        answered,
        reply: a.reply,
        line: a.line ?? null,
        heard: a.heard ?? null,
        node: a.next,
        step: a.next ? 'question' : 'parent',
      };
    }
    case 'HEARD_UNCLEAR':
      // Same question again; Ralph asks them to tap (or says the safeguarding line).
      return { ...s, busy: false, reply: a.reply, line: null, heard: a.heard };
    case 'REPLY_DONE':
      return { ...s, reply: null, line: null, heard: null };
    case 'PARENT_DONE':
      return { ...s, busy: false, step: 'waiting' };
    case 'CALLED_IN':
      return { ...s, step: 'goodbye' };
    case 'RESUME_WAITING':
      return {
        ...initialSession,
        visitId: a.visitId,
        lang: a.lang,
        childName: a.childName,
        parentMode: a.parentMode,
        step: 'waiting',
      };
    case 'RESET':
      return initialSession;
  }
}

/** The bits worth surviving a page refresh once the child is waiting (sessionStorage). */
export interface SavedSession {
  visitId: string;
  lang: Lang;
  childName: string;
  parentMode: boolean;
}
