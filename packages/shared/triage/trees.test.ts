import { describe, expect, it } from 'vitest';
import { COMPLAINTS, type SlotMap } from '../types.js';
import { TREES, getNode, nextNodeId, normalizeAnswer, treeForComplaint } from './trees.js';
import { MAYA } from './fixtures/maya.js';

describe.each(Object.values(TREES).map((t) => [t.id, t] as const))('tree "%s"', (_id, tree) => {
  const nodes = Object.entries(tree.nodes);

  it('start node exists', () => {
    expect(tree.nodes[tree.start]).toBeDefined();
  });

  it('every goto/default target exists', () => {
    for (const [, node] of nodes) {
      for (const rule of node.next ?? []) {
        const target = 'default' in rule ? rule.default : rule.goto;
        expect(tree.nodes[target], `missing node "${target}"`).toBeDefined();
      }
    }
  });

  it('every node is reachable and the tree has no cycles', () => {
    const seen = new Set<string>();
    const walk = (id: string, path: string[]) => {
      expect(path, `cycle at ${id}`).not.toContain(id);
      seen.add(id);
      for (const rule of tree.nodes[id]!.next ?? []) walk('default' in rule ? rule.default : rule.goto, [...path, id]);
    };
    walk(tree.start, []);
    expect([...seen].sort()).toEqual(nodes.map(([id]) => id).sort());
  });

  it('choice nodes have options, number nodes have max, slots are unique', () => {
    for (const [id, node] of nodes) {
      if (node.answer_type === 'choice') expect(node.options?.length, id).toBeGreaterThan(1);
      if (node.answer_type === 'number') expect(node.max, id).toBeGreaterThan(0);
    }
    const slots = nodes.map(([, n]) => n.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('asks at most 10 questions on any path', () => {
    expect(nodes.length).toBeLessThanOrEqual(10);
  });
});

describe('treeForComplaint', () => {
  it('maps every complaint to a tree', () => {
    for (const c of COMPLAINTS) expect(treeForComplaint(c).nodes).toBeDefined();
    expect(treeForComplaint('tummy').id).toBe('tummy');
  });
});

describe('nextNodeId', () => {
  const tummy = TREES.tummy!;
  it('branches on vomiting', () => {
    expect(nextNodeId(tummy, 'throw_up', { vomiting: 'yes' })).toBe('throw_up_count');
    expect(nextNodeId(tummy, 'throw_up', { vomiting: 'no' })).toBe('poop');
  });
  it('returns null at the end', () => {
    expect(nextNodeId(tummy, 'anything_else', {})).toBeNull();
  });
  it("walks Maya's whole path in order", () => {
    const slots: SlotMap = {};
    let id: string | null = tummy.start;
    for (const [expectedId, value] of MAYA.answers) {
      expect(id).toBe(expectedId);
      const node = getNode(tummy, id!);
      slots[node.slot] = normalizeAnswer(node, value);
      id = nextNodeId(tummy, id!, slots);
    }
    expect(id).toBeNull();
    expect(slots).toEqual(MAYA.slots);
  });
});

describe('normalizeAnswer', () => {
  const n = (id: string) => getNode(TREES.tummy!, id);
  it('accepts valid values and rejects wrong types', () => {
    expect(normalizeAnswer(n('throw_up'), 'yes')).toBe('yes');
    expect(normalizeAnswer(n('throw_up'), 'maybe')).toBeNull();
    expect(normalizeAnswer(n('how_long'), 'today')).toBe('today');
    expect(normalizeAnswer(n('how_long'), 'yesterday')).toBeNull();
    expect(normalizeAnswer(n('where'), 'lower_right_tummy')).toBe('lower_right_tummy');
    expect(normalizeAnswer(n('where'), 'elbow')).toBeNull();
    expect(normalizeAnswer(n('pain_face'), 4)).toBe(4);
    expect(normalizeAnswer(n('pain_face'), 6)).toBeNull();
    expect(normalizeAnswer(n('pain_face'), '4')).toBeNull();
    expect(normalizeAnswer(n('anything_else'), '  my head too  ')).toBe('my head too');
    expect(normalizeAnswer(n('anything_else'), '   ')).toBeNull();
  });
  it('clamps "max or more" numbers', () => {
    expect(normalizeAnswer(n('throw_up_count'), 9)).toBe(5);
    expect(normalizeAnswer(n('throw_up_count'), -1)).toBeNull();
  });
});
