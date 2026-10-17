import { BODY_REGIONS, FACE_MAX, YES_NO, type Complaint, type SlotMap, type SlotValue } from '../types.js';
import { TreeSchema, type Tree, type TreeNode } from '../schemas.js';
import tummyJson from './trees/tummy.json' with { type: 'json' };
import generalJson from './trees/general.json' with { type: 'json' };

export const TREES: Record<string, Tree> = {
  tummy: TreeSchema.parse(tummyJson),
  general: TreeSchema.parse(generalJson),
};

/** Tier 1: tummy has its own tree; everything else uses the general tree (fever/breathing get their own in Tier 2). */
const COMPLAINT_TREE: Record<Complaint, string> = {
  tummy: 'tummy',
  fever: 'general',
  breathing: 'general',
  other: 'general',
};

export function treeForComplaint(complaint: Complaint): Tree {
  return TREES[COMPLAINT_TREE[complaint]]!;
}

export function getNode(tree: Tree, nodeId: string): TreeNode {
  const node = tree.nodes[nodeId];
  if (!node) throw new Error(`Tree "${tree.id}" has no node "${nodeId}"`);
  return node;
}

/** Pick the next node id from a node's `next` rules, or null at the end of the tree. */
export function nextNodeId(tree: Tree, nodeId: string, slots: SlotMap): string | null {
  const node = getNode(tree, nodeId);
  for (const rule of node.next ?? []) {
    if ('default' in rule) return rule.default;
    if (Object.entries(rule.if).every(([slot, value]) => slots[slot] === value)) return rule.goto;
  }
  return null;
}

/**
 * Validate + normalize an answer for a node (tap or interpreted voice).
 * Returns null if the value isn't acceptable for this answer type.
 */
export function normalizeAnswer(node: TreeNode, value: unknown): SlotValue | null {
  switch (node.answer_type) {
    case 'yes_no':
      return typeof value === 'string' && (YES_NO as readonly string[]).includes(value) ? value : null;
    case 'choice':
      return typeof value === 'string' && node.options?.includes(value) ? value : null;
    case 'body_map':
      return typeof value === 'string' && value in BODY_REGIONS ? value : null;
    case 'faces':
      return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= FACE_MAX
        ? (value as number)
        : null;
    case 'number': {
      if (!Number.isInteger(value) || (value as number) < 0) return null;
      // "max" means "max or more": clamp so 9 throw-ups records as 5.
      return node.max ? Math.min(value as number, node.max) : (value as number);
    }
    case 'free_speech':
      return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1000) : null;
  }
}
