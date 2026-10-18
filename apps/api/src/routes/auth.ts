// Staff sign-in endpoints (open — everything else under /api/staff requires the session).
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { checkBadgePin, clearSessionCookie, makeSessionToken, sessionFrom, setSessionCookie, signInConfigured } from '../auth.js';
import { HttpError, parse } from '../http.js';

const LoginBody = z.object({
  badge: z.string().trim().min(1).max(20),
  pin: z.string().trim().min(1).max(12),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/staff/login', async (req, reply) => {
    if (!signInConfigured()) throw new HttpError(503, 'Staff sign-in is not set up on this server');
    const { badge, pin } = parse(LoginBody, req.body);
    const staff = checkBadgePin(badge, pin);
    // Same message either way: don't reveal whether the badge or the PIN was wrong.
    if (!staff) throw new HttpError(401, 'Badge number or PIN not recognised');
    setSessionCookie(req, reply, makeSessionToken(staff));
    req.log.info({ badge: staff.badge }, 'staff signed in');
    return { staff };
  });

  app.post('/staff/logout', async (req, reply) => {
    clearSessionCookie(req, reply);
    return { ok: true };
  });

  app.get('/staff/me', async (req) => {
    const staff = sessionFrom(req);
    if (!staff) throw new HttpError(401, 'Not signed in');
    return { staff };
  });
};
