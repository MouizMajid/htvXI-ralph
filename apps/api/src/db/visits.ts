// All SQL for visits, turns, check-ins, alerts, and nurse actions. Routes call these; no SQL elsewhere.
import type { Alert, Checkin, Complaint, Feeling, Lang, ParentAnswers, SlotMap, SlotValue, Speaker } from '@ralph/shared';
import { requireDb } from './client.js';

export interface VisitRow {
  id: string;
  patient_id: string;
  first_name: string;
  age_years: number;
  language: Lang;
  arrived_at: Date;
  status: 'waiting' | 'in_room' | 'done';
  parent_mode: boolean;
  chief_complaint: Complaint | null;
  tree_id: string | null;
  current_node: string | null;
  slots: SlotMap;
  parent_answers: ParentAnswers;
  parent_confirmed_at: Date | null;
  called_in_at: Date | null;
  origin: 'kiosk' | 'seed';
}

export interface TurnRow {
  id: number;
  at: Date;
  node_id: string | null;
  speaker: Speaker;
  question: string | null;
  text_original: string | null;
  text_en: string | null;
  slot: string | null;
  slot_value: SlotValue;
  input: 'tap' | 'voice' | 'text' | 'skip' | null;
}

export interface FlagRow extends Alert {
  id: number;
  at: Date;
  acknowledged_at: Date | null;
}

const VISIT_COLUMNS = `v.id, v.patient_id, p.first_name, p.age_years::float8 AS age_years, p.language,
  v.arrived_at, v.status, v.parent_mode, v.chief_complaint, v.tree_id, v.current_node, v.slots,
  v.parent_answers, v.parent_confirmed_at, v.called_in_at, v.origin`;

export async function createVisit(input: {
  first_name: string;
  age_years: number;
  weight_kg?: number;
  language: Lang;
  parent_mode: boolean;
  origin?: 'kiosk' | 'seed';
  arrived_at?: Date;
}): Promise<string> {
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const [patient] = await tx<{ id: string }[]>`
      INSERT INTO patients (first_name, age_years, weight_kg, language, is_synthetic)
      VALUES (${input.first_name}, ${input.age_years}, ${input.weight_kg ?? null}, ${input.language}, TRUE)
      RETURNING id`;
    const [visit] = await tx<{ id: string }[]>`
      INSERT INTO visits (patient_id, parent_mode, origin, arrived_at)
      VALUES (${patient!.id}, ${input.parent_mode}, ${input.origin ?? 'kiosk'}, coalesce(${input.arrived_at ?? null}::timestamptz, now()))
      RETURNING id`;
    return visit!.id;
  });
}

export async function getVisit(id: string): Promise<VisitRow | null> {
  const sql = requireDb();
  const [row] = await sql.unsafe<VisitRow[]>(
    `SELECT ${VISIT_COLUMNS} FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = $1`,
    [id],
  );
  return row ?? null;
}

export async function setComplaint(id: string, complaint: Complaint, treeId: string, startNode: string) {
  const sql = requireDb();
  await sql`
    UPDATE visits SET chief_complaint = ${complaint}, tree_id = ${treeId}, current_node = ${startNode}, slots = '{}'::jsonb
    WHERE id = ${id}`;
}

/** Record one answer: write the slot, move to the next node, and log the turn — atomically. */
export async function saveAnswer(
  id: string,
  a: {
    node_id: string;
    question: string;
    slot: string;
    value: SlotValue;
    next_node: string | null;
    speaker: Speaker;
    input: TurnRow['input'];
    text_original?: string | null;
    text_en?: string | null;
    confidence?: number | null;
    at?: Date;
  },
) {
  const sql = requireDb();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE visits
      SET slots = slots || ${tx.json({ [a.slot]: a.value })}, current_node = ${a.next_node}
      WHERE id = ${id}`;
    await tx`
      INSERT INTO turns (visit_id, at, node_id, speaker, question, text_original, text_en, slot, slot_value, confidence, input)
      VALUES (${id}, coalesce(${a.at ?? null}::timestamptz, now()), ${a.node_id}, ${a.speaker}, ${a.question}, ${a.text_original ?? null},
              ${a.text_en ?? null}, ${a.slot}, ${tx.json(a.value)}, ${a.confidence ?? null}, ${a.input})`;
  });
}

/**
 * A spoken answer we heard but couldn't map to an answer (or Gemini was unavailable). Stored so the
 * nurse sees the child's words; no slot changes and the tree doesn't move.
 */
export async function saveHeardTurn(
  id: string,
  t: { node_id: string; question: string; speaker: Speaker; text_original: string; text_en: string | null },
) {
  const sql = requireDb();
  await sql`
    INSERT INTO turns (visit_id, node_id, speaker, question, text_original, text_en, input)
    VALUES (${id}, ${t.node_id}, ${t.speaker}, ${t.question}, ${t.text_original}, ${t.text_en}, 'voice')`;
}

/** Parent edit of an earlier answer: overwrite the slot (no node movement), log as a parent turn. */
export async function saveParentEdit(id: string, e: { node_id: string; question: string; slot: string; value: SlotValue }) {
  const sql = requireDb();
  await sql.begin(async (tx) => {
    await tx`UPDATE visits SET slots = slots || ${tx.json({ [e.slot]: e.value })} WHERE id = ${id}`;
    await tx`
      INSERT INTO turns (visit_id, node_id, speaker, question, slot, slot_value, input)
      VALUES (${id}, ${e.node_id}, 'parent', ${e.question}, ${e.slot}, ${tx.json(e.value)}, 'tap')`;
  });
}

export async function saveParentAnswers(id: string, answers: ParentAnswers, at?: Date) {
  const sql = requireDb();
  await sql`
    UPDATE visits SET parent_answers = ${sql.json(answers)}, parent_confirmed_at = coalesce(${at ?? null}::timestamptz, now())
    WHERE id = ${id}`;
}

export async function listTurns(id: string): Promise<TurnRow[]> {
  const sql = requireDb();
  return sql<TurnRow[]>`
    SELECT id::int AS id, at, node_id, speaker, question, text_original, text_en, slot, slot_value, input
    FROM turns WHERE visit_id = ${id} ORDER BY at, id`;
}

/**
 * One waiting-room chat exchange: the child's message (+ English) and Ralph's reply, stored
 * as conversation turns (node_id 'companion') so the nurse reads them with everything else.
 */
export async function insertChatTurns(
  id: string,
  t: { child_original: string; child_en: string | null; input: 'text' | 'voice'; ralph_reply: string | null },
) {
  const sql = requireDb();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO turns (visit_id, node_id, speaker, text_original, text_en, input)
      VALUES (${id}, 'companion', 'child', ${t.child_original}, ${t.child_en}, ${t.input})`;
    if (t.ralph_reply) {
      await tx`
        INSERT INTO turns (visit_id, node_id, speaker, text_original, text_en)
        VALUES (${id}, 'companion', 'ralph', ${t.ralph_reply}, NULL)`;
    }
  });
}

export async function insertCheckin(
  id: string,
  c: { feeling: Feeling; pain_face?: number | null; note?: string | null; note_en?: string | null; at?: Date },
) {
  const sql = requireDb();
  await sql`
    INSERT INTO checkins (visit_id, at, pain_face, feeling, note, note_en)
    VALUES (${id}, coalesce(${c.at ?? null}::timestamptz, now()), ${c.pain_face ?? null}, ${c.feeling}, ${c.note ?? null}, ${c.note_en ?? null})`;
}

export async function listCheckins(id: string): Promise<Checkin[]> {
  const sql = requireDb();
  return sql<Checkin[]>`
    SELECT at, feeling, pain_face, note_en FROM checkins WHERE visit_id = ${id} ORDER BY at`;
}

/** Insert alerts the visit doesn't already have (by key). Returns only the newly inserted ones. */
export async function insertNewAlerts(id: string, alerts: Alert[], at?: Date): Promise<FlagRow[]> {
  if (alerts.length === 0) return [];
  const sql = requireDb();
  return sql.begin(async (tx) => {
    const inserted: FlagRow[] = [];
    for (const a of alerts) {
      const rows = await tx<FlagRow[]>`
        INSERT INTO flags (visit_id, at, kind, key, reason)
        VALUES (${id}, coalesce(${at ?? null}::timestamptz, now()), ${a.kind}, ${a.key}, ${a.reason})
        ON CONFLICT (visit_id, key) DO NOTHING
        RETURNING id::int AS id, at, kind, key, reason, acknowledged_at`;
      inserted.push(...rows);
    }
    return inserted;
  });
}

export async function listFlags(id: string): Promise<FlagRow[]> {
  const sql = requireDb();
  return sql<FlagRow[]>`
    SELECT id::int AS id, at, kind, key, reason, acknowledged_at FROM flags WHERE visit_id = ${id} ORDER BY at, id`;
}

export async function acknowledgeFlag(visitId: string, flagId: number): Promise<boolean> {
  const sql = requireDb();
  const rows = await sql`
    UPDATE flags SET acknowledged_at = now()
    WHERE id = ${flagId} AND visit_id = ${visitId} AND acknowledged_at IS NULL
    RETURNING id`;
  return rows.length > 0;
}

export async function setStatus(id: string, status: VisitRow['status']) {
  const sql = requireDb();
  await sql`
    UPDATE visits SET status = ${status},
      called_in_at = CASE WHEN ${status} = 'in_room' THEN now() ELSE called_in_at END
    WHERE id = ${id}`;
}

export async function logNurseAction(id: string, action: string, payload: Record<string, unknown> = {}) {
  const sql = requireDb();
  await sql`INSERT INTO nurse_actions (visit_id, action, payload) VALUES (${id}, ${action}, ${JSON.stringify(payload)}::jsonb)`;
}

export interface QueueRow {
  id: string;
  first_name: string;
  age_years: number;
  language: Lang;
  arrived_at: Date;
  status: VisitRow['status'];
  parent_mode: boolean;
  chief_complaint: Complaint | null;
  complaint_words_en: string | null;
  open_alerts: number;
  alerts: { id: number; kind: Alert['kind']; reason: string; acknowledged: boolean }[];
}

/** Waiting + in-room children: unacknowledged alerts first, then by arrival (oldest first). */
export async function queue(): Promise<QueueRow[]> {
  const sql = requireDb();
  return sql<QueueRow[]>`
    SELECT v.id, p.first_name, p.age_years::float8 AS age_years, p.language, v.arrived_at, v.status,
           v.parent_mode, v.chief_complaint,
           (SELECT coalesce(t.text_en, t.text_original) FROM turns t
             WHERE t.visit_id = v.id AND t.speaker <> 'ralph' AND t.input IN ('voice', 'text')
             ORDER BY t.at, t.id LIMIT 1) AS complaint_words_en,
           count(f.id) FILTER (WHERE f.acknowledged_at IS NULL)::int AS open_alerts,
           coalesce(json_agg(json_build_object('id', f.id::int, 'kind', f.kind, 'reason', f.reason,
                                               'acknowledged', f.acknowledged_at IS NOT NULL)
                             ORDER BY f.at, f.id) FILTER (WHERE f.id IS NOT NULL), '[]') AS alerts
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN flags f ON f.visit_id = v.id
    WHERE v.status IN ('waiting', 'in_room')
    GROUP BY v.id, p.id
    ORDER BY (v.status = 'in_room'), (count(f.id) FILTER (WHERE f.acknowledged_at IS NULL) = 0), v.arrived_at`;
}

/** Remove visits and everything hanging off them (check-ins have no FK, so explicit). */
export async function deleteVisits(ids: string[]) {
  if (ids.length === 0) return;
  const sql = requireDb();
  await sql.begin(async (tx) => {
    const patients = await tx<{ patient_id: string }[]>`SELECT patient_id FROM visits WHERE id IN ${tx(ids)}`;
    await tx`DELETE FROM checkins WHERE visit_id IN ${tx(ids)}`;
    await tx`DELETE FROM visits WHERE id IN ${tx(ids)}`;
    const pids = patients.map((p) => p.patient_id);
    if (pids.length) await tx`DELETE FROM patients WHERE id IN ${tx(pids)}`;
  });
}

export async function visitIdsByOrigin(origin: VisitRow['origin']): Promise<string[]> {
  const sql = requireDb();
  return (await sql<{ id: string }[]>`SELECT id FROM visits WHERE origin = ${origin}`).map((r) => r.id);
}
