// Pure helpers that turn API data into what the dashboard shows. No React, no fetch —
// tested in dashboard-data.test.ts. Staff text is always English (`t` is a fixed-English t).
import type { TFunction } from 'i18next';
import {
  TREES,
  type AlertKind,
  type NodeView,
  type StaffQueueItem,
  type StaffTurn,
  type StaffVisitDetail,
} from '@ralph/shared';
import { answerText } from '../kiosk/format';

/** How each alert kind looks and is named. Never a level or a score — just what happened. */
export const ALERT_KIND: Record<AlertKind, { label: string; chip: string; stripe: string }> = {
  red_flag: { label: 'Red flag', chip: 'bg-danger-soft text-danger', stripe: 'bg-danger' },
  deterioration: { label: 'Getting worse', chip: 'bg-warning-soft text-warning', stripe: 'bg-warning' },
  unresponsive: { label: 'Not responding', chip: 'bg-warning-soft text-warning', stripe: 'bg-warning' },
  safeguarding: {
    label: 'Safeguarding — talk with the child privately',
    chip: 'bg-safeguard-soft text-safeguard',
    stripe: 'bg-safeguard',
  },
};

/** Row stripe: the most serious open alert (safeguarding > red flag > the rest); none if no open alerts. */
export function rowStripe(item: StaffQueueItem): string {
  const open = item.alerts.filter((a) => !a.acknowledged).map((a) => a.kind);
  if (open.includes('safeguarding')) return ALERT_KIND.safeguarding.stripe;
  if (open.includes('red_flag')) return ALERT_KIND.red_flag.stripe;
  if (open.length) return ALERT_KIND.deterioration.stripe;
  return 'bg-staff-line';
}

export const minutesSince = (iso: string, now = Date.now()) => Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));

export const COMPLAINT_LABEL: Record<string, string> = {
  tummy: 'Tummy',
  fever: 'Hot or sick',
  breathing: 'Breathing / cough',
  other: 'Something else',
};

export const LANGUAGE_LABEL: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  'zh-CN': 'Mandarin',
};

/** Alert ids in `queue` that weren't in `seen` (for the "new alert" highlight). */
export function newAlertIds(queue: StaffQueueItem[], seen: ReadonlySet<number>): number[] {
  return queue.flatMap((v) => v.alerts.filter((a) => !a.acknowledged && !seen.has(a.id)).map((a) => a.id));
}

function nodeViewFor(treeId: string | null, nodeId: string | null): NodeView | null {
  const tree = treeId ? TREES[treeId] : undefined;
  const node = tree && nodeId ? tree.nodes[nodeId] : undefined;
  if (!tree || !node || !nodeId) return null;
  return { tree: tree.id, id: nodeId, ask: node.ask, answer_type: node.answer_type, options: node.options, max: node.max };
}

function displayAnswer(t: TFunction, turn: StaffTurn, node: NodeView | null): string {
  if (turn.input === 'skip') return 'Skipped';
  if (node?.answer_type === 'free_speech' || turn.input === 'text' || turn.input === 'voice') {
    return `“${turn.text_en ?? turn.text_original ?? String(turn.slot_value ?? '')}”`;
  }
  return node ? answerText(t, node, turn.slot_value) : String(turn.slot_value ?? '—');
}

export interface GlanceRow {
  question: string;
  answer: string;
  /** Original-language words when they differ from the English. */
  original: string | null;
  editedByParent: boolean;
}

/** One row per question, latest answer wins; parent corrections are marked. */
export function answersAtAGlance(t: TFunction, d: StaffVisitDetail): GlanceRow[] {
  const byNode = new Map<string, StaffTurn[]>();
  for (const turn of d.turns) {
    if (!turn.node_id || turn.node_id === 'companion' || turn.speaker === 'ralph') continue;
    byNode.set(turn.node_id, [...(byNode.get(turn.node_id) ?? []), turn]);
  }
  return [...byNode.entries()].map(([nodeId, turns]) => {
    const latest = turns.at(-1)!;
    const node = nodeViewFor(d.visit.tree_id, nodeId);
    const original = latest.text_original && latest.text_en && latest.text_original !== latest.text_en ? latest.text_original : null;
    return {
      question: latest.question ?? node?.ask ?? nodeId,
      answer: displayAnswer(t, latest, node),
      original,
      editedByParent: turns.length > 1 && latest.speaker === 'parent',
    };
  });
}

const YES_NO_LABEL: Record<string, string> = { yes: 'Yes', no: 'No', not_sure: 'Not sure' };
const ONSET_LABEL: Record<string, string> = {
  today: 'Today',
  '1_2_days': '1–2 days ago',
  more_than_2_days: 'More than 2 days ago',
  not_sure: 'Not sure',
};

/** The parent's own answers, in a fixed order, skipping anything not filled in. */
export function parentDetails(p: Record<string, unknown>): { label: string; value: string }[] {
  const rows: [string, unknown, (v: unknown) => string][] = [
    ['Started', p.onset, (v) => ONSET_LABEL[String(v)] ?? String(v)],
    ['Highest temperature', p.max_temp_c, (v) => `${String(v)} °C`],
    ['Medicine given', p.meds_given, String],
    ['Keeping drinks down', p.keeps_fluids_down, (v) => YES_NO_LABEL[String(v)] ?? String(v)],
    ['Peed in last 8 hours', p.peed_recently, (v) => YES_NO_LABEL[String(v)] ?? String(v)],
    ['Unusually sleepy', p.very_sleepy, (v) => YES_NO_LABEL[String(v)] ?? String(v)],
    ['Rash', p.rash, (v) => YES_NO_LABEL[String(v)] ?? String(v)],
    ['Conditions / allergies', p.conditions, String],
    ['Notes', p.notes, String],
  ];
  return rows.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([label, v, fmt]) => ({ label, value: fmt(v) }));
}

export type ConversationItem =
  | { kind: 'answer'; at: string; question: string; answer: string; original: string | null; by: 'child' | 'parent' }
  | { kind: 'chat'; at: string; by: 'child' | 'ralph'; text: string; original: string | null };

/** Everything said, in order: tree answers (question → answer) and waiting-room chat. */
export function conversation(t: TFunction, d: StaffVisitDetail): ConversationItem[] {
  return d.turns.map((turn): ConversationItem => {
    const original =
      turn.text_original && turn.text_en && turn.text_original !== turn.text_en ? turn.text_original : null;
    if (turn.node_id === 'companion') {
      return {
        kind: 'chat',
        at: turn.at,
        by: turn.speaker === 'ralph' ? 'ralph' : 'child',
        text: turn.text_en ?? turn.text_original ?? '',
        original: turn.speaker === 'ralph' ? null : original,
      };
    }
    const node = nodeViewFor(d.visit.tree_id, turn.node_id);
    return {
      kind: 'answer',
      at: turn.at,
      question: turn.question ?? node?.ask ?? turn.node_id ?? '',
      answer: displayAnswer(t, turn, node),
      original,
      by: turn.speaker === 'parent' ? 'parent' : 'child',
    };
  });
}

export const FEELING_LABEL: Record<string, { label: string; chip: string }> = {
  better: { label: 'Better', chip: 'bg-success-soft text-success' },
  same: { label: 'About the same', chip: 'bg-staff-bg text-ink' },
  worse: { label: 'Worse', chip: 'bg-warning-soft text-warning' },
  no_response: { label: 'No response', chip: 'bg-warning-soft text-warning' },
};

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
