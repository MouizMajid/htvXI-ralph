// Integration tests: real routes (app.inject) against the real Tiger DB.
// Every visit created here is deleted in afterAll. Skipped without DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MAYA } from '@ralph/shared/fixtures';
import { buildApp } from '../build-app.js';
import { sql } from '../db/client.js';
import { deleteVisits } from '../db/visits.js';

const created: string[] = [];
let app: FastifyInstance;

async function call(method: 'GET' | 'POST', url: string, payload?: unknown) {
  const res = await app.inject({ method, url: `/api${url}`, payload: payload as object });
  return { status: res.statusCode, body: res.json() as any, raw: res.body };
}

async function newVisit(first_name: string, age_years: number, language = 'en') {
  const res = await call('POST', '/visits', { first_name, age_years, language });
  expect(res.status).toBe(201);
  created.push(res.body.visit_id);
  return res.body.visit_id as string;
}

/** Kiosk responses must never leak alert details. */
function expectNoAlertLeak(raw: string) {
  expect(raw).not.toMatch(/"(alerts?|flags?|kind|reason)"/);
}

describe.skipIf(!process.env.DATABASE_URL)('visit API (Tiger)', () => {
  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterAll(async () => {
    await deleteVisits(created);
    await app?.close();
    await sql?.end();
  });

  describe("Maya's demo path", () => {
    let maya: string;
    let earlier: string;

    beforeAll(async () => {
      earlier = await newVisit('TEST-Zed', 8); // arrives first, never gets an alert
      maya = await newVisit('TEST-Maya', MAYA.age_years);
    });

    it('walks the tummy tree with taps and typed text', async () => {
      const start = await call('POST', `/visits/${maya}/complaint`, { complaint: 'tummy' });
      expect(start.body.node).toMatchObject({ id: 'where', answer_type: 'body_map' });

      let next = start.body.node;
      for (const [nodeId, value] of MAYA.answers) {
        expect(next?.id).toBe(nodeId);
        const res = await call('POST', `/visits/${maya}/turns/tap`, { node_id: nodeId, value });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.reply).toBe('thanks');
        expectNoAlertLeak(res.raw);
        next = res.body.next;
      }
      expect(next).toBeNull();
    });

    it('parent confirms; next check-in becomes due', async () => {
      const before = await call('GET', `/visits/${maya}/status`);
      expect(before.body).toMatchObject({ status: 'waiting', next_checkin_at: null });

      expect((await call('POST', `/visits/${maya}/parent`, { answers: MAYA.parent })).status).toBe(200);
      const after = await call('GET', `/visits/${maya}/status`);
      expect(after.body.next_checkin_at).not.toBeNull();
      expectNoAlertLeak(after.raw);
    });

    it('staff see her answers, conversation, and no alerts on arrival', async () => {
      const { body } = await call('GET', `/staff/visits/${maya}`);
      expect(body.visit.slots).toEqual(MAYA.slots);
      expect(body.visit.parent_answers).toEqual(MAYA.parent);
      expect(body.turns).toHaveLength(MAYA.answers.length);
      expect(body.turns[0]).toMatchObject({ speaker: 'child', question: 'Can you show me where your tummy hurts?', input: 'tap' });
      expect(body.turns.at(-1)).toMatchObject({ input: 'text', text_en: MAYA.slots.anything_else });
      expect(body.alerts).toEqual([]);
    });

    it('raises "getting worse" alerts from check-ins, once each', async () => {
      for (const c of MAYA.checkinsGettingWorse) {
        await call('POST', `/visits/${maya}/checkins`, { feeling: c.feeling, pain_face: c.pain_face });
      }
      await call('POST', `/visits/${maya}/checkins`, { feeling: 'worse', pain_face: 4 }); // same findings again
      const { body } = await call('GET', `/staff/visits/${maya}`);
      expect(body.alerts.map((a: any) => a.key)).toEqual(['det:pain_up:4', 'det:worse_twice']);
      expect(body.alerts[0].reason).toBe('Pain went from 2 → 4');
    });

    it("queue shows the child's own words, not button values", async () => {
      const row = (await call('GET', '/staff/queue')).body.visits.find((v: any) => v.id === maya);
      expect(row).toMatchObject({ complaint_words_en: MAYA.slots.anything_else, chief_complaint: 'tummy' });
    });

    it('queue puts children with open alerts first, then by arrival', async () => {
      const order = (await call('GET', '/staff/queue')).body.visits
        .map((v: any) => v.id)
        .filter((id: string) => id === maya || id === earlier);
      expect(order).toEqual([maya, earlier]);

      const { body } = await call('GET', `/staff/visits/${maya}`);
      for (const a of body.alerts) {
        const ack = await call('POST', `/staff/visits/${maya}/actions`, { action: 'acknowledge_flag', flag_id: a.id });
        expect(ack.status).toBe(200);
      }
      const after = (await call('GET', '/staff/queue')).body.visits
        .map((v: any) => v.id)
        .filter((id: string) => id === maya || id === earlier);
      expect(after).toEqual([earlier, maya]);
    });

    it('call in → kiosk sees in_room; no more check-ins', async () => {
      expect((await call('POST', `/staff/visits/${maya}/actions`, { action: 'call_in' })).status).toBe(200);
      expect((await call('GET', `/visits/${maya}/status`)).body).toMatchObject({ status: 'in_room', next_checkin_at: null });
      expect((await call('POST', `/visits/${maya}/checkins`, { feeling: 'same' })).status).toBe(409);
    });
  });

  describe('alerts and safeguarding', () => {
    it('breathing complaint raises a red flag immediately', async () => {
      const id = await newVisit('TEST-Breath', 9);
      await call('POST', `/visits/${id}/complaint`, { complaint: 'breathing' });
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.alerts.map((a: any) => a.key)).toEqual(['red:breathing_complaint']);
    });

    it('a disclosure gets the fixed reply on the kiosk and a staff-only alert', async () => {
      const id = await newVisit('TEST-Safe', 8);
      await call('POST', `/visits/${id}/complaint`, { complaint: 'other' });
      const res = await call('POST', `/visits/${id}/turns/tap`, { node_id: 'what_wrong', value: 'my uncle hits me' });
      expect(res.body.reply).toBe('safeguarding_reply');
      expect(res.body.next.id).toBe('where'); // the conversation simply continues
      expectNoAlertLeak(res.raw);

      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.alerts).toEqual([expect.objectContaining({ kind: 'safeguarding', key: 'safeguarding:hits me' })]);
    });

    it('parent notes are checked for safeguarding too', async () => {
      const id = await newVisit('TEST-SafeParent', 6);
      await call('POST', `/visits/${id}/complaint`, { complaint: 'tummy' });
      await call('POST', `/visits/${id}/parent`, { answers: { notes: 'she says she is scared to go home' } });
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.alerts.map((a: any) => a.kind)).toEqual(['safeguarding']);
    });

    it('parent edits overwrite the answer and are logged as the parent', async () => {
      const id = await newVisit('TEST-Edit', 7);
      await call('POST', `/visits/${id}/complaint`, { complaint: 'tummy' });
      await call('POST', `/visits/${id}/turns/tap`, { node_id: 'where', value: 'belly_button' });
      await call('POST', `/visits/${id}/turns/tap`, { node_id: 'pain_face', value: 1 });
      await call('POST', `/visits/${id}/parent`, { answers: {}, edits: [{ node_id: 'pain_face', value: 3 }] });
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.visit.slots.pain_face).toBe(3);
      expect(body.turns.at(-1)).toMatchObject({ speaker: 'parent', node_id: 'pain_face', slot_value: 3 });
    });

    it('under-4 → parent mode; answers are recorded as the parent and shown in the queue', async () => {
      const res = await call('POST', '/visits', { first_name: 'TEST-Baby', age_years: 2.5, language: 'en' });
      const id = res.body.visit_id;
      created.push(id);
      expect(res.body.parent_mode).toBe(true);
      await call('POST', `/visits/${id}/complaint`, { complaint: 'fever' });
      await call('POST', `/visits/${id}/turns/tap`, { node_id: 'what_wrong', value: 'Fever since last night' });
      await call('POST', `/visits/${id}/turns/tap`, { node_id: 'where', skip: true });
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.turns[0]).toMatchObject({ speaker: 'parent', input: 'text', text_en: 'Fever since last night' });
      expect(body.turns[1]).toMatchObject({ speaker: 'parent', input: 'skip', slot_value: null });
      const row = (await call('GET', '/staff/queue')).body.visits.find((v: any) => v.id === id);
      expect(row.complaint_words_en).toBe('Fever since last night');
    });
  });

  describe('waiting room: chat and check-ins', () => {
    let id: string;
    const chat = (message: string) =>
      call('POST', `/visits/${id}/companion`, { message, history: [], first_name: 'TEST-Chat', age_years: 8 });

    beforeAll(async () => {
      id = await newVisit('TEST-Chat', 8);
      await call('POST', `/visits/${id}/complaint`, { complaint: 'tummy' });
    });

    it("stores the chat as the child's words and Ralph's reply; records no feeling", async () => {
      const res = await chat('I like dinosaurs, my favourite is the T-rex');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ reply: null, wants_quiet: false, offer_checkin: false }); // no Gemini → kiosk fallback
      expectNoAlertLeak(res.raw);
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.turns.at(-1)).toMatchObject({
        node_id: 'companion',
        speaker: 'child',
        text_en: 'I like dinosaurs, my favourite is the T-rex',
      });
      expect(body.checkins).toEqual([]);
    });

    it('"I feel worse" offers the tap check-in instead of recording a feeling', async () => {
      const res = await chat('I feel worse');
      expect(res.body.offer_checkin).toBe(true);
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.checkins).toEqual([]);
      expect(body.alerts).toEqual([]);
    });

    it('worrying words in chat raise a red flag (code decides)', async () => {
      await chat('my chest hurts a bit');
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.alerts.map((a: any) => a.key)).toEqual(['red:said:chest_pain']);
    });

    it('a disclosure in chat gets the fixed reply and a staff-only alert', async () => {
      const res = await chat('my stepdad hits me');
      expect(res.body.reply).toBe('Thank you for telling me. A nurse will come talk with you.');
      expectNoAlertLeak(res.raw);
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.alerts.map((a: any) => a.kind)).toContain('safeguarding');
    });

    it('two unanswered check-ins raise "not responding"; status schedules the next one', async () => {
      await call('POST', `/visits/${id}/parent`, { answers: {} });
      for (let i = 0; i < 2; i++) {
        expect((await call('POST', `/visits/${id}/checkins`, { feeling: 'no_response' })).status).toBe(200);
      }
      const { body } = await call('GET', `/staff/visits/${id}`);
      expect(body.alerts.map((a: any) => a.key)).toContain('unresp:2');
      const status = (await call('GET', `/visits/${id}/status`)).body;
      expect(Date.parse(status.next_checkin_at)).toBeGreaterThan(Date.now());
    });

    it('rejects chat for unknown or malformed visits', async () => {
      const body = { message: 'hi', history: [], age_years: 8 };
      expect((await call('POST', '/visits/demo/companion', body)).status).toBe(400);
      expect((await call('POST', '/visits/00000000-0000-4000-8000-000000000000/companion', body)).status).toBe(404);
    });
  });

  describe('validation', () => {
    let id: string;
    beforeAll(async () => {
      id = await newVisit('TEST-Valid', 7);
    });

    it('rejects answers before a complaint is chosen', async () => {
      expect((await call('POST', `/visits/${id}/turns/tap`, { node_id: 'where', value: 'head' })).status).toBe(409);
    });
    it('rejects an answer to the wrong question', async () => {
      await call('POST', `/visits/${id}/complaint`, { complaint: 'tummy' });
      expect((await call('POST', `/visits/${id}/turns/tap`, { node_id: 'pain_face', value: 2 })).status).toBe(409);
    });
    it('rejects invalid values', async () => {
      expect((await call('POST', `/visits/${id}/turns/tap`, { node_id: 'where', value: 'elbow' })).status).toBe(400);
      expect((await call('POST', '/visits', { first_name: '', age_years: 5 })).status).toBe(400);
      expect((await call('POST', `/visits/${id}/checkins`, { feeling: 'meh' })).status).toBe(400);
    });
    it('404 for unknown visits, 400 for malformed ids', async () => {
      expect((await call('GET', '/staff/visits/00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await call('GET', '/staff/visits/not-a-uuid')).status).toBe(400);
    });
  });
});
