// All SQL for visits, turns, check-ins, alerts, and nurse actions. Routes call these; no SQL elsewhere.
// When DATABASE_URL is not configured locally (sql === null), falls back to an in-memory store so the
// full kiosk triage + games + companion + staff queue flow works out-of-the-box in local dev.
import { randomUUID } from 'node:crypto';
import type {
  Alert,
  AssignedNurseInfo,
  Checkin,
  Complaint,
  Feeling,
  Lang,
  Nurse,
  NurseStatus,
  NurseWorkload,
  ParentAnswers,
  SlotMap,
  SlotValue,
  Speaker,
} from '@ralph/shared';
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
  assigned_nurse_id?: string | null;
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

// ---------- Nurse Roster & Shift Status ----------
export const DEFAULT_NURSES: Nurse[] = [
  {
    id: 'nurse-sarah',
    name: 'Nurse Sarah',
    title: 'Pediatric Emergency RN',
    avatar: '👩‍⚕️',
    status: 'ready',
    specialty: 'Trauma & Critical Care',
  },
  {
    id: 'nurse-marcus',
    name: 'Nurse Marcus',
    title: 'Pediatric Acute Care RN',
    avatar: '👨‍⚕️',
    status: 'ready',
    specialty: 'Respiratory & Fast-Track Triage',
  },
  {
    id: 'nurse-elena',
    name: 'Nurse Elena',
    title: 'Pediatric Nurse Practitioner',
    avatar: '👩‍⚕️',
    status: 'away',
    specialty: 'Urgent Care & Procedures',
  },
];

const nursesMap = new Map<string, Nurse>(DEFAULT_NURSES.map((n) => [n.id, { ...n }]));
const visitNurseAssignments = new Map<string, string>(); // visitId -> nurseId

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
  let id: string;
  if (!sql) {
    id = randomUUID();
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
  } else {
    const db = requireDb();
    id = await db.begin(async (tx) => {
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

  // Automatically run AI matchmaker to assign available nurse
  await assignPatientToBestNurse(id);
  return id;
}

export async function getVisit(id: string): Promise<VisitRow | null> {
  const assigned = visitNurseAssignments.get(id);
  if (!sql) {
    const v = memVisits.get(id);
    return v
      ? {
          ...v,
          slots: { ...v.slots },
          parent_answers: { ...v.parent_answers },
          assigned_nurse_id: assigned ?? (v.slots.assigned_nurse_id as string | undefined) ?? null,
        }
      : null;
  }
  const db = requireDb();
  const [row] = await db.unsafe<VisitRow[]>(
    `SELECT ${VISIT_COLUMNS} FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = $1`,
    [id],
  );
  if (!row) return null;
  row.assigned_nurse_id = assigned ?? (row.slots?.assigned_nurse_id as string | undefined) ?? null;
  return row;
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
  } else {
    const db = requireDb();
    await db`
      UPDATE visits SET parent_answers = ${db.json(answers)}, parent_confirmed_at = coalesce(${at ?? null}::timestamptz, now())
      WHERE id = ${id}`;
  }
  // Run or refine matchmaker assignment when parent submits
  await assignPatientToBestNurse(id);
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
  assigned_nurse?: AssignedNurseInfo | null;
  assigned_nurse_id?: string | null;
  estimated_wait_minutes?: number | null;
  complexity?: 'critical' | 'urgent' | 'standard';
}

/** Waiting + in-room children: unacknowledged alerts first, then by arrival (oldest first). */
export async function queue(): Promise<QueueRow[]> {
  let rows: QueueRow[] = [];
  if (!sql) {
    for (const v of memVisits.values()) {
      if (v.status !== 'waiting' && v.status !== 'in_room') continue;
      const turns = memTurns.get(v.id) ?? [];
      const firstWordsTurn = turns.find(
        (t) => t.speaker !== 'ralph' && (t.input === 'voice' || t.input === 'text'),
      );
      const flags = memFlags.get(v.id) ?? [];
      const open_alerts = flags.filter((f) => f.acknowledged_at === null).length;
      const nurseId = visitNurseAssignments.get(v.id) ?? (v.slots.assigned_nurse_id as string | undefined);
      const nurse = nurseId ? nursesMap.get(nurseId) : null;
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
        assigned_nurse_id: nurseId ?? null,
        assigned_nurse: nurse
          ? { id: nurse.id, name: nurse.name, title: nurse.title, avatar: nurse.avatar }
          : null,
      });
    }
  } else {
    const db = requireDb();
    const sqlRows = await db<
      (QueueRow & { alerts_json: { id: number; kind: Alert['kind']; reason: string; acknowledged: boolean }[] })[]
    >`
      SELECT v.id, p.first_name, p.age_years::float8 AS age_years, p.language, v.arrived_at, v.status,
             v.parent_mode, v.chief_complaint,
             (SELECT coalesce(t.text_en, t.text_original) FROM turns t
               WHERE t.visit_id = v.id AND t.speaker <> 'ralph' AND t.input IN ('voice', 'text')
               ORDER BY t.at, t.id LIMIT 1) AS complaint_words_en,
             count(f.id) FILTER (WHERE f.acknowledged_at IS NULL)::int AS open_alerts,
             coalesce(json_agg(json_build_object('id', f.id::int, 'kind', f.kind, 'reason', f.reason,
                                                 'acknowledged', f.acknowledged_at IS NOT NULL)
                               ORDER BY f.at, f.id) FILTER (WHERE f.id IS NOT NULL), '[]') AS alerts_json
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN flags f ON f.visit_id = v.id
      WHERE v.status IN ('waiting', 'in_room')
      GROUP BY v.id, p.id
      ORDER BY (v.status = 'in_room'), (count(f.id) FILTER (WHERE f.acknowledged_at IS NULL) = 0), v.arrived_at`;

    rows = sqlRows.map((r) => {
      const nurseId = visitNurseAssignments.get(r.id);
      const nurse = nurseId ? nursesMap.get(nurseId) : null;
      return {
        ...r,
        alerts: r.alerts_json || [],
        assigned_nurse_id: nurseId ?? null,
        assigned_nurse: nurse
          ? { id: nurse.id, name: nurse.name, title: nurse.title, avatar: nurse.avatar }
          : null,
      };
    });
  }

  // Enrich with estimated wait times and complexity for each patient
  for (const r of rows) {
    const assignment = getVisitLiveWait(r.id, rows);
    r.estimated_wait_minutes = assignment.estimatedWaitMinutes;
    r.complexity = getVisitComplexity(r);
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

/** Remove visits and everything hanging off them (check-ins have no FK, so explicit). */
export async function deleteVisits(ids: string[]) {
  if (ids.length === 0) return;
  for (const id of ids) visitNurseAssignments.delete(id);
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

// =========================================================================
// SMART AI MATCHMAKER & NURSE SHIFT MANAGEMENT
// =========================================================================

export function listNurses(): Nurse[] {
  return Array.from(nursesMap.values());
}

export function setNurseStatus(nurseId: string, status: NurseStatus): Nurse | null {
  const nurse = nursesMap.get(nurseId);
  if (!nurse) return null;
  nurse.status = status;

  // If nurse goes "away", reassign any un-admitted waiting patients to available nurses
  if (status === 'away') {
    void reassignWaitingPatientsForAwayNurse(nurseId);
  }
  return { ...nurse };
}

/** Case complexity classification */
function getVisitComplexity(
  v: Pick<QueueRow, 'alerts' | 'chief_complaint' | 'age_years'>,
): 'critical' | 'urgent' | 'standard' {
  const hasCriticalAlert = v.alerts?.some(
    (a) => !a.acknowledged && (a.kind === 'red_flag' || a.kind === 'safeguarding'),
  );
  if (hasCriticalAlert) return 'critical';

  const hasUrgentAlert = v.alerts?.some((a) => !a.acknowledged && a.kind === 'deterioration');
  if (hasUrgentAlert || v.chief_complaint === 'breathing' || v.age_years < 1) return 'urgent';

  return 'standard';
}

/**
 * Estimated visit treatment duration in minutes based on clinical acuity & case complexity.
 * - Critical (red flags, safeguarding, acute hypoxia): ~28-35 minutes
 * - Urgent (deterioration, respiratory, infants): ~18-24 minutes
 * - Standard (minor tummy, fever, mild issue): ~8-12 minutes
 */
function estimateTreatmentDurationMinutes(
  v: Pick<QueueRow, 'alerts' | 'chief_complaint' | 'age_years'>,
): number {
  const complexity = getVisitComplexity(v);
  if (complexity === 'critical') return 30;
  if (complexity === 'urgent') return 20;
  return 10;
}

/**
 * Calculates true clinical workload for all nurses.
 * Looks at how busy each nurse ACTUALLY is (true difficulty-adjusted minutes),
 * not just head-count!
 */
export async function getNurseWorkloads(): Promise<NurseWorkload[]> {
  const activeQueue = await queue();
  const nurses = listNurses();

  return nurses.map((nurse) => {
    if (nurse.status === 'away') {
      return {
        nurse,
        inRoomCount: 0,
        waitingCount: 0,
        totalWorkloadMinutes: 9999, // Ineligible for assignment
        activePatientComplexity: 'none',
        breakdown: 'On Break / Away (Not accepting new patients)',
      };
    }

    const assignedPatients = activeQueue.filter(
      (p) => visitNurseAssignments.get(p.id) === nurse.id,
    );
    const inRoomPatient = assignedPatients.find((p) => p.status === 'in_room');
    const waitingPatients = assignedPatients.filter((p) => p.status === 'waiting');

    let inRoomRemainingMinutes = 0;
    if (inRoomPatient) {
      const fullDuration = estimateTreatmentDurationMinutes(inRoomPatient);
      // Assume called_in_at or fallback
      const elapsed = Math.max(0, Math.round((Date.now() - inRoomPatient.arrived_at.getTime()) / 60_000));
      inRoomRemainingMinutes = Math.max(4, fullDuration - Math.min(elapsed, fullDuration - 4));
    }

    const waitingMinutes = waitingPatients.reduce(
      (sum, p) => sum + estimateTreatmentDurationMinutes(p),
      0,
    );

    const totalWorkloadMinutes = inRoomRemainingMinutes + waitingMinutes;

    let activeComplexity: NurseWorkload['activePatientComplexity'] = 'none';
    if (inRoomPatient) activeComplexity = inRoomPatient.complexity || 'standard';
    else if (waitingPatients.length > 0) activeComplexity = waitingPatients[0]?.complexity || 'standard';

    const breakdown = inRoomPatient
      ? `Treating ${inRoomPatient.first_name} (~${inRoomRemainingMinutes}m left, ${activeComplexity}) + ${waitingPatients.length} waiting (~${waitingMinutes}m)`
      : waitingPatients.length > 0
        ? `${waitingPatients.length} waiting (~${waitingMinutes}m total)`
        : 'Available immediately (0 min workload)';

    return {
      nurse,
      inRoomCount: inRoomPatient ? 1 : 0,
      waitingCount: waitingPatients.length,
      totalWorkloadMinutes,
      activePatientComplexity: activeComplexity,
      breakdown,
    };
  });
}

/**
 * Smart AI Matchmaker:
 * Assigns a patient to the ready nurse with the lightest true workload (who will be free soonest).
 */
export async function assignPatientToBestNurse(visitId: string): Promise<{
  nurse: Nurse | null;
  estimatedWaitMinutes: number;
  queuePosition: number;
  reason: string;
}> {
  // If already assigned and that nurse is still ready, keep assignment
  const existingNurseId = visitNurseAssignments.get(visitId);
  const existingNurse = existingNurseId ? nursesMap.get(existingNurseId) : null;
  if (existingNurse && existingNurse.status === 'ready') {
    const live = await getVisitAssignment(visitId);
    return {
      nurse: existingNurse,
      estimatedWaitMinutes: live.estimatedWaitMinutes,
      queuePosition: live.queuePosition,
      reason: `Assigned to ${existingNurse.name}`,
    };
  }

  const workloads = await getNurseWorkloads();
  const readyWorkloads = workloads.filter((w) => w.nurse.status === 'ready');

  if (readyWorkloads.length === 0) {
    // No nurses ready right now
    return {
      nurse: null,
      estimatedWaitMinutes: 20,
      queuePosition: 1,
      reason: 'All nurses currently away / on break. First available nurse will be matched automatically.',
    };
  }

  // Sort by lowest true workload (minutes until free)
  readyWorkloads.sort((a, b) => a.totalWorkloadMinutes - b.totalWorkloadMinutes);
  const bestMatch = readyWorkloads[0]!;

  visitNurseAssignments.set(visitId, bestMatch.nurse.id);

  // Also update slots on visit for persistence
  if (!sql) {
    const mem = memVisits.get(visitId);
    if (mem) mem.slots.assigned_nurse_id = bestMatch.nurse.id;
  } else {
    try {
      const db = requireDb();
      await db`UPDATE visits SET slots = slots || ${db.json({ assigned_nurse_id: bestMatch.nurse.id })} WHERE id = ${visitId}`;
    } catch {
      /* ignore */
    }
  }

  const live = await getVisitAssignment(visitId);
  const reason = `Matched with ${bestMatch.nurse.name} (lightest true workload: ${bestMatch.totalWorkloadMinutes} min)`;
  return {
    nurse: bestMatch.nurse,
    estimatedWaitMinutes: live.estimatedWaitMinutes,
    queuePosition: live.queuePosition,
    reason,
  };
}

/** Reassign any waiting patients whose nurse just went Away */
async function reassignWaitingPatientsForAwayNurse(awayNurseId: string) {
  const activeQueue = await queue();
  const waitingForAway = activeQueue.filter(
    (p) => p.status === 'waiting' && visitNurseAssignments.get(p.id) === awayNurseId,
  );
  for (const patient of waitingForAway) {
    visitNurseAssignments.delete(patient.id);
    await assignPatientToBestNurse(patient.id);
  }
}

/** Live wait time calculation for any patient */
function getVisitLiveWait(
  visitId: string,
  currentQueue: QueueRow[],
): { estimatedWaitMinutes: number; queuePosition: number; assignedNurse: AssignedNurseInfo | null } {
  const patient = currentQueue.find((p) => p.id === visitId);
  const nurseId = visitNurseAssignments.get(visitId);
  const nurse = nurseId ? nursesMap.get(nurseId) : null;

  if (!patient || patient.status === 'in_room') {
    return {
      estimatedWaitMinutes: 0,
      queuePosition: 0,
      assignedNurse: nurse
        ? { id: nurse.id, name: nurse.name, title: nurse.title, avatar: nurse.avatar }
        : null,
    };
  }

  if (!nurse) {
    return {
      estimatedWaitMinutes: 15,
      queuePosition: 1,
      assignedNurse: null,
    };
  }

  // Patients assigned to this nurse
  const nursePatients = currentQueue.filter(
    (p) => visitNurseAssignments.get(p.id) === nurse.id,
  );
  const inRoom = nursePatients.find((p) => p.status === 'in_room');
  const waitingAhead = nursePatients.filter(
    (p) => p.status === 'waiting' && p.arrived_at.getTime() < patient.arrived_at.getTime(),
  );

  let waitMin = 0;
  if (inRoom) {
    const full = estimateTreatmentDurationMinutes(inRoom);
    const elapsed = Math.max(0, Math.round((Date.now() - inRoom.arrived_at.getTime()) / 60_000));
    waitMin += Math.max(3, full - Math.min(elapsed, full - 3));
  }
  for (const ahead of waitingAhead) {
    waitMin += estimateTreatmentDurationMinutes(ahead);
  }

  return {
    estimatedWaitMinutes: Math.max(2, waitMin),
    queuePosition: waitingAhead.length + 1,
    assignedNurse: { id: nurse.id, name: nurse.name, title: nurse.title, avatar: nurse.avatar },
  };
}

/** Public helper to retrieve patient assignment info (for kiosk polling) */
export async function getVisitAssignment(visitId: string) {
  const currentQueue = await queue();
  return getVisitLiveWait(visitId, currentQueue);
}

/** Get personalized queue for a specific nurse */
export async function getPersonalizedQueue(nurseId: string) {
  const currentQueue = await queue();
  const assigned = currentQueue.filter(
    (p) => visitNurseAssignments.get(p.id) === nurseId,
  );
  const inRoom = assigned.find((p) => p.status === 'in_room') || null;
  const waiting = assigned.filter((p) => p.status === 'waiting');
  const upNext = waiting[0] || null;

  return {
    nurse: nursesMap.get(nurseId) || null,
    inRoom,
    upNext,
    waiting,
    totalAssigned: assigned.length,
  };
}
