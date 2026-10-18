import type { Complaint, Feeling, Lang, NodeView, ParentAnswers, ReplyKey } from '@ralph/shared';

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

const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });

// ---------- Kiosk (see api-and-ai skill for the contract) ----------

export interface VisitStatus {
  status: 'waiting' | 'in_room' | 'done';
  current_node: string | null;
  next_checkin_at: string | null;
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
