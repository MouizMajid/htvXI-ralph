// Staff sign-in: badge number + PIN, checked on the server; a signed, HTTP-only cookie lasts
// one shift. Deliberately small (no user table or session store) — in a real hospital this
// is replaced by the hospital's own sign-in (SSO with multi-factor auth).
// Fails closed: with no accounts or no secret configured, nobody can sign in.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { StaffSession } from '@ralph/shared';
import { env } from './env.js';

export const SESSION_COOKIE = 'ralph_staff';
export const SESSION_HOURS = 12;

interface Account {
  badge: string;
  pinHash: Buffer;
  name: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** `1042:4821:Nurse Sam Lee;2077:3156:Dr. Ana Ortiz` → accounts. Malformed entries are skipped. */
export function parseAccounts(raw: string): Account[] {
  return raw
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [badge, pin, ...name] = entry.split(':');
      if (!badge?.trim() || !pin?.trim() || !name.join(':').trim()) return [];
      return [{ badge: badge.trim(), pinHash: sha256(pin.trim()), name: name.join(':').trim() }];
    });
}

const accounts = parseAccounts(env.STAFF_ACCOUNTS);

export const signInConfigured = () => accounts.length > 0 && env.SESSION_SECRET.length >= 16;

/** The account for this badge + PIN, or null. PINs are compared as hashes in constant time. */
export function checkBadgePin(badge: string, pin: string): StaffSession | null {
  const account = accounts.find((a) => a.badge === badge.trim());
  // Hash and compare even when the badge is unknown, so timing doesn't reveal which badges exist.
  const ok = timingSafeEqual(sha256(pin.trim()), account?.pinHash ?? sha256(`no-account:${pin}`));
  return account && ok ? { badge: account.badge, name: account.name } : null;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (payload: string) => createHmac('sha256', env.SESSION_SECRET).update(payload).digest();

/** `<base64url(json)>.<base64url(hmac)>` — tamper-proof, expires on its own. */
export function makeSessionToken(s: StaffSession, now = Date.now()): string {
  const payload = b64(JSON.stringify({ ...s, exp: now + SESSION_HOURS * 3_600_000 }));
  return `${payload}.${b64(sign(payload))}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): StaffSession | null {
  if (!token || !signInConfigured()) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as StaffSession & { exp: number };
    return data.exp > now ? { badge: data.badge, name: data.name } : null;
  } catch {
    return null;
  }
}

function cookieValue(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export const sessionFrom = (req: FastifyRequest) => readSessionToken(cookieValue(req, SESSION_COOKIE));

function cookieAttrs(req: FastifyRequest, maxAgeSec: number) {
  // Behind Vercel the request arrives as https via the proxy; locally it's plain http.
  const https = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https';
  return `Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${https ? '; Secure' : ''}`;
}

export function setSessionCookie(req: FastifyRequest, reply: FastifyReply, token: string) {
  reply.header('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieAttrs(req, SESSION_HOURS * 3600)}`);
}

export function clearSessionCookie(req: FastifyRequest, reply: FastifyReply) {
  reply.header('Set-Cookie', `${SESSION_COOKIE}=; ${cookieAttrs(req, 0)}`);
}
