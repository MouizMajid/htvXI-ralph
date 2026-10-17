// All SQL for visits, turns, check-ins, alerts, and nurse actions. Routes call these; no SQL elsewhere.
// When DATABASE_URL is not configured locally (sql === null), falls back to an in-memory store so the
// full kiosk triage + games + companion + staff queue flow works out-of-the-box in local dev.
import { randomUUID } from 'node:crypto';
import type { Alert, Checkin, Complaint, Feeling, Lang, ParentAnswers, SlotMap, SlotValue, Speaker } from '@ralph/shared';
import { requireDb, sql } from './client.js';

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

// ---------- In-memory fallback when DATABASE_URL is not set ----------
const memVisits = new Map<string, VisitRow>();
const memTurns = new Map<string, TurnRow[]>();
const memCheckins = new Map<string, Checkin[]>();
const memFlags = new Map<string, FlagRow[]>();
let nextMemId = 1;

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
  if (!sql) {
    const id = randomUUID();
    memVisits.set(id, {
      id,
      patient_id: randomUUID(),
      first_name: input.first_name,
      age_years: input.age_years,
      language: input.language,
      arrived_at: input.arrived_at ?? new Date(),
      status: 'waiting',
      parent_mode: input.parent_mode,
      chief_complaint: null,
      tree_id: null,
      current_node: null,
      slots: {},
      parent_answers: {},
      parent_confirmed_at: null,
      called_in_at: null,
      origin: input.origin ?? 'kiosk',
    });
    memTurns.set(id, []);
    memCheckins.set(id, []);
    memFlags.set(id, []);
    return id;
  }
  const db = requireDb();
  return db.begin(async (tx) => {
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
  if (!sql) {
    const v = memVisits.get(id);
    return v ? { ...v, slots: { ...v.slots }, parent_answers: { ...v.parent_answers } } : null;
  }
  const db = requireDb();
  const [row] = await db.unsafe<VisitRow[]>(
    `SELECT ${VISIT_COLUMNS} FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = $1`,
    [id],
  );
  return row ?? null;
}

export async function setComplaint(id: string, complaint: Complaint, treeId: string, startNode: string) {
  if (!sql) {
    const v = memVisits.get(id);
    if (v) {
      v.chief_complaint = complaint;
      v.tree_id = treeId;
      v.current_node = startNode;
      v.slots = {};
    }
    return;
  }
  const db = requireDb();
  await db`
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
  if (!sql) {
    const v = memVisits.get(id);
    if (v) {
      v.slots = { ...v.slots, [a.slot]: a.value };
      v.current_node = a.next_node;
    }
    const turns = memTurns.get(id) ?? [];
    turns.push({
      id: nextMemId++,
      at: a.at ?? new Date(),
      node_id: a.node_id,
      speaker: a.speaker,
      question: a.question,
      text_original: a.text_original ?? null,
      text_en: a.text_en ?? null,
      slot: a.slot,
      slot_value: a.value,
      input: a.input,
    });
    memTurns.set(id, turns);
    return;
  }
  const db = requireDb();
  await db.begin(async (tx) => {
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

/** Parent edit of an earlier answer: overwrite the slot (no node movement), log as a parent turn. */
export async function saveParentEdit(id: string, e: { node_id: string; question: string; slot: string; value: SlotValue }) {
  if (!sql) {
    const v = memVisits.get(id);
    if (v) v.slots = { ...v.slots, [e.slot]: e.value };
    const turns = memTurns.get(id) ?? [];
    turns.push({
      id: nextMemId++,
      at: new Date(),
      node_id: e.node_id,
      speaker: 'parent',
      question: e.question,
      text_original: null,
      text_en: null,
      slot: e.slot,
      slot_value: e.value,
      input: 'tap',
    });
    memTurns.set(id, turns);
    return;
  }
  const db = requireDb();
  await db.begin(async (tx) => {
    await tx`UPDATE visits SET slots = slots || ${tx.json({ [e.slot]: e.value })} WHERE id = ${id}`;
    await tx`
      INSERT INTO turns (visit_id, node_id, speaker, question, slot, slot_value, input)
      VALUES (${id}, ${e.node_id}, 'parent', ${e.question}, ${e.slot}, ${tx.json(e.value)}, 'tap')`;
  });
}

export async function saveParentAnswers(id: string, answers: ParentAnswers, at?: Date) {
  if (!sql) {
    const v = memVisits.get(id);
    if (v) {
      v.parent_answers = { ...answers };
      v.parent_confirmed_at = at ?? new Date();
    }
    return;
  }
  const db = requireDb();
  await db`
    UPDATE visits SET parent_answers = ${db.json(answers)}, parent_confirmed_at = coalesce(${at ?? null}::timestamptz, now())
    WHERE id = ${id}`;
}

export async function listTurns(id: string): Promise<TurnRow[]> {
  if (!sql) return [...(memTurns.get(id) ?? [])];
  const db = requireDb();
  return db<TurnRow[]>`
    SELECT id::int AS id, at, node_id, speaker, question, text_original, text_en, slot, slot_value, input
    FROM turns WHERE visit_id = ${id} ORDER BY at, id`;
}

export async function insertCheckin(
  id: string,
  c: { feeling: Feeling; pain_face?: number | null; note?: string | null; note_en?: string | null; at?: Date },
) {
  if (!sql) {
    const list = memCheckins.get(id) ?? [];
    list.push({
      at: c.at ?? new Date(),
      feeling: c.feeling,
      pain_face: c.pain_face ?? null,
      note_en: c.note_en ?? c.note ?? null,
    });
    memCheckins.set(id, list);
    return;
  }
  const db = requireDb();
  await db`
    INSERT INTO checkins (visit_id, at, pain_face, feeling, note, note_en)
    VALUES (${id}, coalesce(${c.at ?? null}::timestamptz, now()), ${c.pain_face ?? null}, ${c.feeling}, ${c.note ?? null}, ${c.note_en ?? null})`;
}

export async function listCheckins(id: string): Promise<Checkin[]> {
  if (!sql) return [...(memCheckins.get(id) ?? [])];
  const db = requireDb();
  return db<Checkin[]>`
    SELECT at, feeling, pain_face, note_en FROM checkins WHERE visit_id = ${id} ORDER BY at`;
}

/** Insert alerts the visit doesn't already have (by key). Returns only the newly inserted ones. */
export async function insertNewAlerts(id: string, alerts: Alert[], at?: Date): Promise<FlagRow[]> {
  if (alerts.length === 0) return [];
  if (!sql) {
    const list = memFlags.get(id) ?? [];
    const inserted: FlagRow[] = [];
    for (const a of alerts) {
      if (list.some((f) => f.key === a.key)) continue;
      const row: FlagRow = {
        id: nextMemId++,
        at: at ?? new Date(),
        kind: a.kind,
        key: a.key,
        reason: a.reason,
        acknowledged_at: null,
      };
      list.push(row);
      inserted.push(row);
    }
    memFlags.set(id, list);
    return inserted;
  }
  const db = requireDb();
  return db.begin(async (tx) => {
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
  if (!sql) return [...(memFlags.get(id) ?? [])];
  const db = requireDb();
  return db<FlagRow[]>`
    SELECT id::int AS id, at, kind, key, reason, acknowledged_at FROM flags WHERE visit_id = ${id} ORDER BY at, id`;
}

export async function acknowledgeFlag(visitId: string, flagId: number): Promise<boolean> {
  if (!sql) {
    const list = memFlags.get(visitId) ?? [];
    const found = list.find((f) => f.id === flagId && f.acknowledged_at === null);
    if (!found) return false;
    found.acknowledged_at = new Date();
    return true;
  }
  const db = requireDb();
  const rows = await db`
    UPDATE flags SET acknowledged_at = now()
    WHERE id = ${flagId} AND visit_id = ${visitId} AND acknowledged_at IS NULL
    RETURNING id`;
  return rows.length > 0;
}

export async function setStatus(id: string, status: VisitRow['status']) {
  if (!sql) {
    const v = memVisits.get(id);
    if (v) {
      v.status = status;
      if (status === 'in_room') v.called_in_at = new Date();
    }
    return;
  }
  const db = requireDb();
  await db`
    UPDATE visits SET status = ${status},
      called_in_at = CASE WHEN ${status} = 'in_room' THEN now() ELSE called_in_at END
    WHERE id = ${id}`;
}

export async function logNurseAction(id: string, action: string, payload: Record<string, unknown> = {}) {
  if (!sql) return;
  const db = requireDb();
  await db`INSERT INTO nurse_actions (visit_id, action, payload) VALUES (${id}, ${action}, ${JSON.stringify(payload)}::jsonb)`;
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
  if (!sql) {
    const rows: QueueRow[] = [];
    for (const v of memVisits.values()) {
      if (v.status !== 'waiting' && v.status !== 'in_room') continue;
      const turns = memTurns.get(v.id) ?? [];
      const firstWordsTurn = turns.find(
        (t) => t.speaker !== 'ralph' && (t.input === 'voice' || t.input === 'text'),
      );
      const flags = memFlags.get(v.id) ?? [];
      const open_alerts = flags.filter((f) => f.acknowledged_at === null).length;
      rows.push({
        id: v.id,
        first_name: v.first_name,
        age_years: v.age_years,
        language: v.language,
        arrived_at: v.arrived_at,
        status: v.status,
        parent_mode: v.parent_mode,
        chief_complaint: v.chief_complaint,
        complaint_words_en: firstWordsTurn ? (firstWordsTurn.text_en ?? firstWordsTurn.text_original) : null,
        open_alerts,
        alerts: flags.map((f) => ({
          id: f.id,
          kind: f.kind,
          reason: f.reason,
          acknowledged: f.acknowledged_at !== null,
        })),
      });
    }
    return rows.sort((a, b) => {
      const aInRoom = a.status === 'in_room' ? 1 : 0;
      const bInRoom = b.status === 'in_room' ? 1 : 0;
      if (aInRoom !== bInRoom) return aInRoom - bInRoom;
      const aNoAlert = a.open_alerts === 0 ? 1 : 0;
      const bNoAlert = b.open_alerts === 0 ? 1 : 0;
      if (aNoAlert !== bNoAlert) return aNoAlert - bNoAlert;
      return a.arrived_at.getTime() - b.arrived_at.getTime();
    });
  }
  const db = requireDb();
  return db<QueueRow[]>`
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
  if (!sql) {
    for (const id of ids) {
      memVisits.delete(id);
      memTurns.delete(id);
      memCheckins.delete(id);
      memFlags.delete(id);
    }
    return;
  }
  const db = requireDb();
  await db.begin(async (tx) => {
    const patients = await tx<{ patient_id: string }[]>`SELECT patient_id FROM visits WHERE id IN ${tx(ids)}`;
    await tx`DELETE FROM checkins WHERE visit_id IN ${tx(ids)}`;
    await tx`DELETE FROM visits WHERE id IN ${tx(ids)}`;
    const pids = patients.map((p) => p.patient_id);
    if (pids.length) await tx`DELETE FROM patients WHERE id IN ${tx(pids)}`;
  });
}

export async function visitIdsByOrigin(origin: VisitRow['origin']): Promise<string[]> {
  if (!sql) {
    return [...memVisits.values()].filter((v) => v.origin === origin).map((v) => v.id);
  }
  const db = requireDb();
  return (await db<{ id: string }[]>`SELECT id FROM visits WHERE origin = ${origin}`).map((r) => r.id);
}
