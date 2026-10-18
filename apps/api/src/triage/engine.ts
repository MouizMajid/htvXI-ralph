// Orchestrates one visit: answers → slots → next question, then re-runs the shared alert
// rules and stores any new alerts. All decisions come from @ralph/shared; SQL from db/visits.
import {
  TREES,
  detectSafeguarding,
  evaluateAlerts,
  getNode,
  nextNodeId,
  normalizeAnswer,
  safeguardingAlert,
  treeForComplaint,
  type Complaint,
  type NodeView,
  type ParentAnswers,
  type ReplyKey,
  type SpokenAnswerResponse,
  type SlotValue,
  type Tree,
} from '@ralph/shared';
import * as db from '../db/visits.js';
import { HttpError, notFound } from '../http.js';
import { interpretTurn } from '../ai/interpret.js';

export function nodeView(tree: Tree, id: string | null): NodeView | null {
  if (!id) return null;
  const n = getNode(tree, id);
  return { tree: tree.id, id, ask: n.ask, answer_type: n.answer_type, options: n.options, max: n.max };
}

export async function loadVisit(id: string): Promise<db.VisitRow> {
  const visit = await db.getVisit(id);
  if (!visit) throw notFound('visit');
  return visit;
}

function treeOf(visit: db.VisitRow): Tree {
  const tree = visit.tree_id ? TREES[visit.tree_id] : undefined;
  if (!tree) throw new HttpError(409, 'complaint not set yet');
  return tree;
}

export async function startComplaint(visitId: string, complaint: Complaint): Promise<NodeView> {
  await loadVisit(visitId);
  const tree = treeForComplaint(complaint);
  await db.setComplaint(visitId, complaint, tree.id, tree.start);
  await refreshAlerts(visitId);
  return nodeView(tree, tree.start)!;
}

export interface AnswerInput {
  node_id: string;
  /** Tap value, or the slot value interpreted from speech. Omitted when skipped. */
  value?: unknown;
  skip?: boolean;
  input: 'tap' | 'voice' | 'text';
  /** For voice/text answers: what was said, and its English translation. */
  text_original?: string;
  text_en?: string;
  confidence?: number;
  llm_safeguarding?: boolean;
  at?: Date;
}

export async function answer(visitId: string, a: AnswerInput): Promise<{ next: NodeView | null; reply: ReplyKey }> {
  const visit = await loadVisit(visitId);
  const tree = treeOf(visit);
  if (a.node_id !== visit.current_node) {
    throw new HttpError(409, `expected an answer for "${visit.current_node ?? 'nothing (tree finished)'}"`);
  }
  const node = getNode(tree, a.node_id);

  let value: SlotValue = null;
  if (!a.skip) {
    value = normalizeAnswer(node, a.value);
    if (value === null) throw new HttpError(400, `invalid answer for a ${node.answer_type} question`);
  }

  const slots = { ...visit.slots, [node.slot]: value };
  const next = nextNodeId(tree, a.node_id, slots);
  // A "tap" on a free-speech question is typed text (the child's own words); every other tap is a button.
  const input = a.skip ? 'skip' : a.input === 'tap' && node.answer_type === 'free_speech' ? 'text' : a.input;
  const spoken = (input === 'text' || input === 'voice') && typeof value === 'string' ? value : null;
  await db.saveAnswer(visitId, {
    node_id: a.node_id,
    question: node.ask,
    slot: node.slot,
    value,
    next_node: next,
    speaker: visit.parent_mode ? 'parent' : 'child',
    input,
    text_original: a.text_original ?? spoken,
    text_en: a.text_en ?? (visit.language === 'en' ? spoken : null),
    confidence: a.confidence ?? null,
    at: a.at,
  });

  const sgAlert = safeguardingAlert(
    detectSafeguarding({
      transcript: a.text_original ?? spoken ?? '',
      lang: visit.language,
      text_en: a.text_en,
      llm_concern: a.llm_safeguarding,
    }),
  );
  await refreshAlerts(visitId, sgAlert ? [sgAlert] : [], a.at);

  return { next: nodeView(tree, next), reply: sgAlert ? 'safeguarding_reply' : 'thanks' };
}

/** Below this, a spoken answer isn't trusted — the child is asked to tap instead. */
export const MIN_VOICE_CONFIDENCE = 0.6;

/**
 * A spoken answer: Gemini reads the transcript, code validates the value (normalizeAnswer).
 * Accepted → saved exactly like a tap (input 'voice', with the child's words + English).
 * Not accepted → the words are kept for the nurse, alerts still run, and the child taps instead.
 */
export async function answerSpoken(
  visitId: string,
  s: { node_id: string; transcript: string | null },
): Promise<SpokenAnswerResponse> {
  const visit = await loadVisit(visitId);
  const tree = treeOf(visit);
  if (s.node_id !== visit.current_node) {
    throw new HttpError(409, `expected an answer for "${visit.current_node ?? 'nothing (tree finished)'}"`);
  }
  const node = getNode(tree, s.node_id);
  const transcript = s.transcript?.trim() || null;
  const sameQuestion = nodeView(tree, s.node_id);
  if (!transcript) return { heard: null, accepted: false, value: null, next: sameQuestion, reply: 'try_tapping', line: null };

  const it = await interpretTurn({ node, age: visit.age_years, lang: visit.language, transcript });
  const textEn = visit.language === 'en' ? transcript : (it?.text_en ?? null);
  const freeSpeech = node.answer_type === 'free_speech';
  const value = normalizeAnswer(node, freeSpeech ? transcript : it?.slot_value);
  const accepted =
    value !== null && (freeSpeech || (it !== null && !it.needs_clarification && it.confidence >= MIN_VOICE_CONFIDENCE));

  if (accepted) {
    const res = await answer(visitId, {
      node_id: s.node_id,
      value,
      input: 'voice',
      text_original: transcript,
      text_en: textEn ?? undefined,
      confidence: it?.confidence,
      llm_safeguarding: it?.safeguarding_concern,
    });
    return {
      heard: transcript,
      accepted: true,
      value,
      next: res.next,
      reply: res.reply,
      line: res.reply === 'thanks' ? (it?.ralph_reply ?? null) : null,
    };
  }

  // Not understood: keep their words, still run safeguarding + the alert rules on them.
  await db.saveHeardTurn(visitId, {
    node_id: s.node_id,
    question: node.ask,
    speaker: visit.parent_mode ? 'parent' : 'child',
    text_original: transcript,
    text_en: textEn,
  });
  const sgAlert = safeguardingAlert(
    detectSafeguarding({
      transcript,
      lang: visit.language,
      text_en: textEn ?? undefined,
      llm_concern: it?.safeguarding_concern,
    }),
  );
  await refreshAlerts(visitId, sgAlert ? [sgAlert] : []);
  return {
    heard: transcript,
    accepted: false,
    value: null,
    next: sameQuestion,
    reply: sgAlert ? 'safeguarding_reply' : 'try_tapping',
    line: null,
  };
}

export interface ParentInput {
  answers: ParentAnswers;
  edits?: { node_id: string; value?: unknown }[];
  at?: Date;
}

export async function parentConfirm(visitId: string, p: ParentInput) {
  const visit = await loadVisit(visitId);
  const tree = treeOf(visit);
  for (const e of p.edits ?? []) {
    const node = tree.nodes[e.node_id];
    if (!node) throw new HttpError(400, `unknown question "${e.node_id}"`);
    const value = normalizeAnswer(node, e.value);
    if (value === null) throw new HttpError(400, `invalid edit for "${e.node_id}"`);
    await db.saveParentEdit(visitId, { node_id: e.node_id, question: node.ask, slot: node.slot, value });
  }
  await db.saveParentAnswers(visitId, p.answers, p.at);

  // Parent free text gets the same safeguarding check as the child's words.
  const extra = [];
  const text = [p.answers.notes, p.answers.conditions, p.answers.meds_given].filter(Boolean).join('. ');
  if (text) {
    const sg = safeguardingAlert(detectSafeguarding({ transcript: text, lang: visit.language }));
    if (sg) extra.push(sg);
  }
  await refreshAlerts(visitId, extra, p.at);
}

export async function checkin(
  visitId: string,
  c: {
    feeling: 'better' | 'same' | 'worse' | 'no_response';
    pain_face?: number | null;
    note?: string | null;
    note_en?: string | null;
    at?: Date;
  },
) {
  const visit = await loadVisit(visitId);
  if (visit.status !== 'waiting') throw new HttpError(409, 'child has already been called in');
  await db.insertCheckin(visitId, c);
  await refreshAlerts(visitId, [], c.at);
}

/** Re-run every rule on the visit's current data; store alerts it doesn't already have. */
export async function refreshAlerts(visitId: string, extra: ReturnType<typeof evaluateAlerts> = [], at?: Date) {
  const [visit, checkins, turns] = await Promise.all([
    loadVisit(visitId),
    db.listCheckins(visitId),
    db.listTurns(visitId),
  ]);
  const childTextsEn = turns
    .filter((t) => t.speaker !== 'ralph' && t.text_en)
    .map((t) => t.text_en as string);
  const alerts = evaluateAlerts({
    age_years: visit.age_years,
    complaint: visit.chief_complaint,
    slots: visit.slots,
    parent: visit.parent_answers,
    checkins,
    child_texts_en: childTextsEn,
  });
  return db.insertNewAlerts(visitId, [...extra, ...alerts], at);
}
