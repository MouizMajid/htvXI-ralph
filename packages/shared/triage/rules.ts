import type { Reason, SlotMap, SuggestedLevel } from '../types.js';
import type { Tree } from '../schemas.js';

/**
 * Team-defined DEMO rules — not clinically validated.
 * Pure functions only; the LLM never decides urgency.
 */

/** Pick the next node id from a node's `next` rules, or null at end of tree. */
export function nextNodeId(tree: Tree, nodeId: string, slots: SlotMap): string | null {
  const node = tree.nodes[nodeId];
  if (!node?.next) return null;
  for (const rule of node.next) {
    if ('default' in rule) return rule.default;
    const matches = Object.entries(rule.if).every(([slot, value]) => slots[slot] === value);
    if (matches) return rule.goto;
  }
  return null;
}

/** Red-flag rules over the slot map. TODO(Tier 1 #5): full rule list from triage-engine skill. */
export function evaluateRedFlags(slots: SlotMap): Reason[] {
  const reasons: Reason[] = [];
  if (slots.pain_face === 5) {
    reasons.push({ points: 0, alert: true, text: 'Severe pain (face 5)' });
  }
  return reasons;
}

/** Map findings to a 1–5 suggested level. TODO(Tier 1 #5): real mapping. */
export function suggestLevel(redFlags: Reason[]): SuggestedLevel {
  return redFlags.some((r) => r.alert) ? 2 : 3;
}
