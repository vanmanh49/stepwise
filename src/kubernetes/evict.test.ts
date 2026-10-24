import { describe, expect, it } from 'vitest';
import { allowedDisruptions, evictionAllowed } from './evict';
import { pod, storeWith } from './fixtures.testutil';
import type { PodDisruptionBudget } from './model';

const pdb = (extra: Partial<PodDisruptionBudget>): PodDisruptionBudget => ({ kind: 'PodDisruptionBudget', name: 'web', selector: [{ key: 'app', op: '=', values: ['web'] }], ...extra });
const four = [pod('a'), pod('b'), pod('c'), pod('d', { ready: false })];

describe('PodDisruptionBudget', () => {
  it('counts allowed disruptions from minAvailable or maxUnavailable', () => {
    expect(allowedDisruptions(pdb({ minAvailable: 2 }), four)).toBe(1);
    expect(allowedDisruptions(pdb({ minAvailable: 3 }), four)).toBe(0);
    // One of the four is already unavailable.
    expect(allowedDisruptions(pdb({ maxUnavailable: 2 }), four)).toBe(1);
    expect(allowedDisruptions(pdb({ maxUnavailable: 1 }), four)).toBe(0);
    expect(allowedDisruptions(pdb({ minAvailable: 9 }), four)).toBe(0);
  });

  it('refuses an eviction that would break a budget, but lets an unready pod go', () => {
    const store = storeWith(...four, pdb({ minAvailable: 3 }));
    expect(evictionAllowed(store, store.get('Pod', 'a')!)).toEqual({ ok: false, reason: "Cannot evict pod as it would violate the pod's disruption budget" });
    expect(evictionAllowed(store, store.get('Pod', 'd')!)).toEqual({ ok: true });
    expect(evictionAllowed(storeWith(...four), four[0]!)).toEqual({ ok: true });
  });

  it('ignores budgets that select other pods', () => {
    const store = storeWith(...four, { ...pdb({ minAvailable: 9 }), selector: [{ key: 'app', op: '=', values: ['api'] }] });
    expect(evictionAllowed(store, four[0]!)).toEqual({ ok: true });
  });
});
