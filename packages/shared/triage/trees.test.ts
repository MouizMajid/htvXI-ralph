import { describe, expect, it } from 'vitest';
import { TreeSchema } from '../schemas.js';
import { nextNodeId } from './rules.js';
import tummyJson from './trees/tummy.json' with { type: 'json' };

const trees = [tummyJson];

describe.each(trees.map((t) => [t.id, t] as const))('tree %s', (_id, json) => {
  const tree = TreeSchema.parse(json);

  it('start node exists', () => {
    expect(tree.nodes[tree.start]).toBeDefined();
  });

  it('every goto/default target exists', () => {
    for (const node of Object.values(tree.nodes)) {
      for (const rule of node.next ?? []) {
        const target = 'default' in rule ? rule.default : rule.goto;
        expect(tree.nodes[target], `missing node "${target}"`).toBeDefined();
      }
    }
  });
});

describe('nextNodeId', () => {
  const tree = TreeSchema.parse(tummyJson);
  it('branches on vomiting', () => {
    expect(nextNodeId(tree, 'throw_up', { vomiting: 'yes' })).toBe('throw_up_count');
    expect(nextNodeId(tree, 'throw_up', { vomiting: 'no' })).toBe('pain_face');
  });
  it('returns null at end of tree', () => {
    expect(nextNodeId(tree, 'pain_face', {})).toBeNull();
  });
});
