import { describe, expect, it } from 'vitest';
import { SESSION_HOURS, checkBadgePin, makeSessionToken, parseAccounts, readSessionToken } from './auth.js';

describe('parseAccounts', () => {
  it('reads badge:pin:name entries and skips malformed ones', () => {
    const accounts = parseAccounts(' 1042:4821:Nurse Sam Lee ; bad-entry ; 2077::No Pin ; 3001:9999:Dr. A: B ');
    expect(accounts.map((a) => [a.badge, a.name])).toEqual([
      ['1042', 'Nurse Sam Lee'],
      ['3001', 'Dr. A: B'],
    ]);
  });
});

describe('sessions', () => {
  it('a session lasts one shift, then expires', () => {
    const t0 = Date.parse('2026-10-18T08:00:00Z');
    const token = makeSessionToken({ badge: '9001', name: 'Test Nurse' }, t0);
    expect(readSessionToken(token, t0 + 60_000)).toEqual({ badge: '9001', name: 'Test Nurse' });
    expect(readSessionToken(token, t0 + SESSION_HOURS * 3_600_000 + 1)).toBeNull();
  });

  it('checks badge + PIN (test accounts from vitest.setup)', () => {
    expect(checkBadgePin('9001', '1234')).toEqual({ badge: '9001', name: 'Test Nurse' });
    expect(checkBadgePin(' 9001 ', ' 1234 ')).toEqual({ badge: '9001', name: 'Test Nurse' });
    expect(checkBadgePin('9001', '1235')).toBeNull();
    expect(checkBadgePin('9999', '1234')).toBeNull();
  });
});
