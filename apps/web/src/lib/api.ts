import type {
  AssignedNurseInfo,
  Complaint,
  Feeling,
  Lang,
  NodeView,
  Nurse,
  NurseStatus,
  NurseWorkload,
  ParentAnswers,
  ReplyKey,
} from '@ralph/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });

// ---------- Kiosk (see api-and-ai skill for the contract) ----------

export interface VisitStatus {
  status: 'waiting' | 'in_room' | 'done';
  current_node: string | null;
  next_checkin_at: string | null;
  assigned_nurse?: AssignedNurseInfo | null;
  estimated_wait_minutes?: number | null;
  queue_position?: number | null;
}

export const kioskApi = {
  createVisit: (body: { first_name: string; age_years: number; weight_kg?: number; language: Lang }) =>
    post<{ visit_id: string; parent_mode: boolean }>('/visits', body),

  setComplaint: (visitId: string, complaint: Complaint) =>
    post<{ node: NodeView }>(`/visits/${visitId}/complaint`, { complaint }),

  answer: (visitId: string, body: { node_id: string; value?: unknown; skip?: boolean }) =>
    post<{ next: NodeView | null; reply: ReplyKey }>(`/visits/${visitId}/turns/tap`, body),

  parentConfirm: (visitId: string, body: { answers: ParentAnswers; edits?: { node_id: string; value: unknown }[] }) =>
    post<{ ok: true }>(`/visits/${visitId}/parent`, body),

  checkin: (visitId: string, body: { feeling: Feeling; pain_face?: number | null }) =>
    post<{ ok: true }>(`/visits/${visitId}/checkins`, body),

  status: (visitId: string) => api<VisitStatus>(`/visits/${visitId}/status`),
};

// ---------- Staff & Nurse Shift Management ----------

export interface PersonalizedPatient {
  id: string;
  first_name: string;
  age_years: number;
  language: Lang;
  arrived_at: string;
  status: 'waiting' | 'in_room' | 'done';
  chief_complaint: Complaint | null;
  complaint_words_en: string | null;
  open_alerts: number;
  alerts: { id: number; kind: string; reason: string; acknowledged: boolean }[];
  estimated_wait_minutes?: number | null;
  complexity?: 'critical' | 'urgent' | 'standard';
}

export interface PersonalizedNurseQueue {
  nurse: Nurse | null;
  inRoom: PersonalizedPatient | null;
  upNext: PersonalizedPatient | null;
  waiting: PersonalizedPatient[];
  totalAssigned: number;
}

export const staffApi = {
  getQueue: () => api<{ visits: PersonalizedPatient[] }>('/staff/queue'),

  getNurses: () => api<{ nurses: NurseWorkload[] }>('/staff/nurses'),

  setNurseStatus: (nurseId: string, status: NurseStatus, actingNurseId?: string) =>
    post<{ nurse: Nurse; workloads: NurseWorkload[] }>(`/staff/nurses/${nurseId}/status`, {
      status,
      acting_nurse_id: actingNurseId ?? nurseId,
    }),

  getPersonalizedPatients: (nurseId: string) =>
    api<PersonalizedNurseQueue>(`/staff/nurses/${nurseId}/patients`),

  getMatchmaker: () =>
    api<{ workloads: NurseWorkload[]; bestAvailableNurse: Nurse | null; explanation: string }>(
      '/staff/matchmaker',
    ),

  callIn: (visitId: string) => post<{ ok: true }>(`/staff/visits/${visitId}/actions`, { action: 'call_in' }),

  clearRoomDone: (visitId: string) => post<{ ok: true }>(`/staff/visits/${visitId}/actions`, { action: 'done' }),

  acknowledgeAlert: (visitId: string, flagId: number) =>
    post<{ ok: true }>(`/staff/visits/${visitId}/actions`, { action: 'acknowledge_flag', flag_id: flagId }),
};
