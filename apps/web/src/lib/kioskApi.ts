import type { CompanionTurnBody, CompanionTurnResponse } from '@ralph/shared';
import { api } from './api';

/**
 * Kiosk API call for the waiting-room chat (check-ins use kioskApi.checkin in ./api).
 * All fail soft: the kiosk keeps working (offline fallback) if the API is down.
 */

/** null → API unreachable / timed out; caller uses the offline reply. */
export async function companionTurn(
  visitId: string,
  body: CompanionTurnBody,
  timeoutMs = 9000,
): Promise<CompanionTurnResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await api<CompanionTurnResponse>(`/visits/${encodeURIComponent(visitId)}/companion`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
