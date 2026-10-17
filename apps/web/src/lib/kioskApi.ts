import type { CheckinBody, CompanionTurnBody, CompanionTurnResponse, GameResult } from '@ralph/shared';
import { api } from './api';

/**
 * Kiosk API calls for games, check-ins, and companion chat.
 * All fail soft: the kiosk keeps working (offline fallback) if the API is down.
 */

export async function postGameResult(visitId: string, result: GameResult): Promise<void> {
  try {
    await api(`/visits/${encodeURIComponent(visitId)}/games`, {
      method: 'POST',
      body: JSON.stringify(result),
    });
  } catch (err) {
    console.warn('game result not saved', err);
  }
}

export async function postCheckin(visitId: string, body: CheckinBody): Promise<void> {
  try {
    await api(`/visits/${encodeURIComponent(visitId)}/checkins`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('check-in not saved', err);
  }
}

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
