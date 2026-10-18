import { describe, expect, it } from 'vitest';
import type { NodeView } from '@ralph/shared';
import { initialSession, reducer, type Action, type Session } from './session';

const node = (id: string): NodeView => ({ tree: 'tummy', id, ask: `ask ${id}`, answer_type: 'yes_no' });
const run = (actions: Action[], from: Session = initialSession) => actions.reduce(reducer, from);

describe('kiosk session reducer', () => {
  it('welcome → language → who → complaint → question', () => {
    const s = run([
      { type: 'START' },
      { type: 'SET_LANG', lang: 'hi' },
      { type: 'REQUEST' },
      { type: 'VISIT_CREATED', visitId: 'v1', childName: 'Priya', parentMode: false },
      { type: 'COMPLAINT_SET', complaint: 'tummy', node: node('where') },
    ]);
    expect(s).toMatchObject({ step: 'question', lang: 'hi', visitId: 'v1', complaint: 'tummy', busy: false });
    expect(s.node?.id).toBe('where');
  });

  it('records each answer against the question it answered, then goes to the parent at the end', () => {
    const asking = run([{ type: 'COMPLAINT_SET', complaint: 'tummy', node: node('a') }]);
    const s1 = reducer(asking, { type: 'ANSWERED', value: 'yes', next: node('b'), reply: 'thanks' });
    expect(s1).toMatchObject({ step: 'question', reply: 'thanks' });
    expect(s1.node?.id).toBe('b');
    const s2 = reducer(s1, { type: 'ANSWERED', value: null, next: null, reply: 'thanks' });
    expect(s2.step).toBe('parent');
    expect(s2.answered.map((q) => [q.node.id, q.value])).toEqual([
      ['a', 'yes'],
      ['b', null],
    ]);
  });

  it('keeps the safeguarding reply until the screen has shown it', () => {
    const s = run([
      { type: 'COMPLAINT_SET', complaint: 'other', node: node('what_wrong') },
      { type: 'ANSWERED', value: 'words', next: node('where'), reply: 'safeguarding_reply' },
    ]);
    expect(s.reply).toBe('safeguarding_reply');
    expect(reducer(s, { type: 'REPLY_DONE' }).reply).toBeNull();
  });

  it("a spoken answer keeps what was heard and Ralph's own line until shown", () => {
    const s = run([
      { type: 'COMPLAINT_SET', complaint: 'tummy', node: node('a') },
      { type: 'ANSWERED', value: 'yes', next: node('b'), reply: 'thanks', line: 'Oh no, poor tummy!', heard: 'yeah I did' },
    ]);
    expect(s).toMatchObject({ step: 'question', line: 'Oh no, poor tummy!', heard: 'yeah I did' });
    expect(s.answered.at(-1)).toEqual({ node: node('a'), value: 'yes' });
    expect(reducer(s, { type: 'REPLY_DONE' })).toMatchObject({ reply: null, line: null, heard: null });
  });

  it('an unclear spoken answer stays on the same question and asks to tap', () => {
    const asking = run([{ type: 'COMPLAINT_SET', complaint: 'tummy', node: node('a') }, { type: 'REQUEST' }]);
    const s = reducer(asking, { type: 'HEARD_UNCLEAR', heard: 'um maybe', reply: 'try_tapping' });
    expect(s).toMatchObject({ step: 'question', busy: false, reply: 'try_tapping', heard: 'um maybe', answered: [] });
    expect(s.node?.id).toBe('a');
  });

  it('fails soft: an error keeps the child on the same screen', () => {
    const asking = run([{ type: 'COMPLAINT_SET', complaint: 'tummy', node: node('a') }, { type: 'REQUEST' }]);
    const s = reducer(asking, { type: 'FAILED' });
    expect(s).toMatchObject({ step: 'question', busy: false, error: true });
    expect(s.node?.id).toBe('a');
    expect(reducer(s, { type: 'REQUEST' }).error).toBe(false);
  });

  it('parent done → waiting → called in → goodbye; reset starts over', () => {
    const s = run([{ type: 'PARENT_DONE' }, { type: 'CALLED_IN' }]);
    expect(s.step).toBe('goodbye');
    expect(reducer(s, { type: 'RESET' })).toEqual(initialSession);
  });

  it('resumes waiting after a refresh without stale answers', () => {
    const s = reducer(initialSession, {
      type: 'RESUME_WAITING',
      visitId: 'v9',
      lang: 'fr',
      childName: 'Chloé',
      parentMode: false,
    });
    expect(s).toEqual({ ...initialSession, step: 'waiting', visitId: 'v9', lang: 'fr', childName: 'Chloé' });
  });
});
