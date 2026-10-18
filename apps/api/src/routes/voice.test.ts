// Voice endpoints against the real Tiger DB, with Gemini replaced by predictable stand-ins so the
// tests check OUR logic (validation, accept/reject, safeguarding), not the model.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Interpretation } from '@ralph/shared';

const fake = vi.hoisted(() => ({
  transcript: null as string | null,
  interpretation: null as Interpretation | null,
}));
vi.mock('../ai/voice.js', async (orig) => ({
  ...(await orig<typeof import('../ai/voice.js')>()),
  transcribe: async () => fake.transcript,
}));
vi.mock('../ai/interpret.js', () => ({ interpretTurn: async () => fake.interpretation }));

const { buildApp } = await import('../build-app.js');
const { sql } = await import('../db/client.js');
const { deleteVisits } = await import('../db/visits.js');

let app: FastifyInstance;
let staffCookie = '';
const created: string[] = [];

const interp = (p: Partial<Interpretation>): Interpretation => ({
  slot_value: null,
  confidence: 0.9,
  needs_clarification: false,
  ralph_reply: 'Oh no, thank you for telling me!',
  text_en: '',
  extra_symptoms: [],
  safeguarding_concern: false,
  off_topic: false,
  ...p,
});

/** multipart/form-data body with a node_id field and a tiny WAV "recording". */
function audioForm(nodeId: string) {
  const boundary = '----ralphtest';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="node_id"\r\n\r\n${nodeId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="answer.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head), Buffer.from('RIFF0000WAVEfake'), Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function speak(id: string, nodeId: string) {
  const { body, headers } = audioForm(nodeId);
  const res = await app.inject({ method: 'POST', url: `/api/visits/${id}/turns/audio`, payload: body, headers });
  return { status: res.statusCode, body: res.json() as any, raw: res.body };
}

async function newTummyVisit(name: string) {
  const res = await app.inject({ method: 'POST', url: '/api/visits', payload: { first_name: name, age_years: 7, language: 'en' } });
  const id = res.json().visit_id as string;
  created.push(id);
  await app.inject({ method: 'POST', url: `/api/visits/${id}/complaint`, payload: { complaint: 'tummy' } });
  return id;
}

const staffView = async (id: string) =>
  (await app.inject({ method: 'GET', url: `/api/staff/visits/${id}`, headers: { cookie: staffCookie } })).json() as any;

describe.skipIf(!process.env.DATABASE_URL)('voice (Tiger, Gemini stubbed)', () => {
  beforeAll(async () => {
    app = await buildApp({ logger: false });
    const login = await app.inject({ method: 'POST', url: '/api/staff/login', payload: { badge: '9001', pin: '1234' } });
    staffCookie = String(login.headers['set-cookie']).split(';')[0]!;
  });
  afterAll(async () => {
    await deleteVisits(created);
    await app?.close();
    await sql?.end();
  });

  it('an uncached line answers at once (404) so the kiosk uses the browser voice', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tts', payload: { text: 'A line nobody pre-generated, ever.' } });
    expect(res.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/tts/${'a'.repeat(64)}` })).statusCode).toBe(404);
  });

  it('a clear spoken answer is validated and saved like a tap, with the words', async () => {
    const id = await newTummyVisit('TEST-Voice1');
    fake.transcript = 'my belly button hurts';
    fake.interpretation = interp({ slot_value: 'belly_button', text_en: 'my belly button hurts' });
    const res = await speak(id, 'where');
    expect(res.body).toMatchObject({ heard: 'my belly button hurts', accepted: true, reply: 'thanks', line: 'Oh no, thank you for telling me!' });
    expect(res.body.next.id).toBe('pain_face');
    const v = await staffView(id);
    expect(v.visit.slots.pain_location).toBe('belly_button');
    expect(v.turns.at(-1)).toMatchObject({ input: 'voice', text_original: 'my belly button hurts', slot_value: 'belly_button' });
  });

  it('an invalid value from Gemini is rejected by code; the words are kept for the nurse', async () => {
    const id = await newTummyVisit('TEST-Voice2');
    fake.transcript = 'my elbow';
    fake.interpretation = interp({ slot_value: 'elbow' }); // not a body region
    const res = await speak(id, 'where');
    expect(res.body).toMatchObject({ accepted: false, reply: 'try_tapping', line: null });
    expect(res.body.next.id).toBe('where'); // same question again
    const v = await staffView(id);
    expect(v.visit.slots.pain_location).toBeUndefined();
    expect(v.turns.at(-1)).toMatchObject({ node_id: 'where', input: 'voice', text_original: 'my elbow', slot_value: null });
  });

  it('low confidence or unclear → tap instead', async () => {
    const id = await newTummyVisit('TEST-Voice3');
    fake.transcript = 'um maybe';
    fake.interpretation = interp({ slot_value: 'lower_left_tummy', confidence: 0.3 });
    expect((await speak(id, 'where')).body).toMatchObject({ accepted: false, reply: 'try_tapping' });
    fake.interpretation = interp({ slot_value: 'lower_left_tummy', needs_clarification: true });
    expect((await speak(id, 'where')).body).toMatchObject({ accepted: false });
  });

  it('nothing heard, or Gemini down → tap instead, nothing saved', async () => {
    const id = await newTummyVisit('TEST-Voice4');
    fake.transcript = null;
    expect((await speak(id, 'where')).body).toEqual({ heard: null, accepted: false, value: null, next: expect.any(Object), reply: 'try_tapping', line: null });
    fake.transcript = 'my tummy';
    fake.interpretation = null;
    expect((await speak(id, 'where')).body).toMatchObject({ heard: 'my tummy', accepted: false });
  });

  it('a disclosure in an unclear answer still raises the staff-only alert and the fixed reply', async () => {
    const id = await newTummyVisit('TEST-Voice5');
    fake.transcript = 'my uncle hits me';
    fake.interpretation = interp({ slot_value: null, needs_clarification: true });
    const res = await speak(id, 'where');
    expect(res.body).toMatchObject({ accepted: false, reply: 'safeguarding_reply' });
    expect(res.raw).not.toMatch(/"(alerts?|kind|reason)"/);
    const v = await staffView(id);
    expect(v.alerts.map((a: any) => a.kind)).toContain('safeguarding');
  });

  it('free-speech questions take the words as the answer', async () => {
    const id = await newTummyVisit('TEST-Voice6');
    const taps: [string, unknown][] = [
      ['where', 'head'], ['pain_face', 2], ['how_long', 'today'], ['throw_up', 'no'], ['poop', 'normal'], ['hot', 'no'],
    ];
    for (const [node_id, value] of taps) {
      await app.inject({ method: 'POST', url: `/api/visits/${id}/turns/tap`, payload: { node_id, value } });
    }
    fake.transcript = 'my head feels funny too';
    fake.interpretation = null; // even without Gemini
    const res = await speak(id, 'anything_else');
    expect(res.body).toMatchObject({ accepted: true, next: null });
  });

  it('rejects non-audio uploads', async () => {
    const boundary = '----x';
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhi\r\n--${boundary}--\r\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/visits/00000000-0000-4000-8000-000000000000/transcribe',
      payload,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    });
    expect(res.statusCode).toBe(415);
  });
});
