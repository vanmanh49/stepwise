import { describe, expect, it } from 'vitest';
import type { PanelsView, ServicesView } from '../../types/visualization';
import { keyExchangeSteps } from './key-exchange';

const defaults = { prime: '23', a: '6', b: '15', attacker: 'None' };
const nodes = (view: unknown) => ((view as PanelsView).panels[0]!.view as ServicesView).nodes.map((n) => n.id);

describe('key exchange scenario', () => {
  it('reaches the textbook shared secret', () => {
    const steps = keyExchangeSteps(defaults);
    const titles = steps.map((s) => s.title).join('\n');
    expect(titles).toContain('A = 8');
    expect(titles).toContain('B = 19');
    expect(steps.at(-1)!.variables).toMatchObject({ alice: 2, bob: 2 });
    expect(nodes(steps[0]!.view)).not.toContain('attacker');
  });

  it('lets the eavesdropper search for the secret on a small prime', () => {
    const last = keyExchangeSteps({ ...defaults, attacker: 'Eavesdropper' }).at(-1)!;
    expect(last.variables).toMatchObject({ tries: 6, found: 6, shared: 2 });
  });

  it('shows at most 3 tries, then a summary, even on the largest prime', () => {
    const steps = keyExchangeSteps({ ...defaults, attacker: 'Eavesdropper', prime: '65537', a: '65000', b: '777' });
    expect(steps.length).toBeLessThanOrEqual(12);
    expect(steps.at(-1)!.variables).toMatchObject({ tries: 65000, found: 65000 });
    expect(steps.filter((s) => s.title.startsWith('Eve tries'))).toHaveLength(3);
  });

  it('does not try past the answer when the secret is small', () => {
    const steps = keyExchangeSteps({ ...defaults, attacker: 'Eavesdropper', a: '2' });
    expect(steps.filter((s) => s.title.startsWith('Eve tries'))).toHaveLength(1);
  });

  it('gives the man in the middle a key with each side', () => {
    const steps = keyExchangeSteps({ ...defaults, attacker: 'Man in the middle' });
    const last = steps.at(-1)!;
    // M = 5^9 mod 23 = 11, so Alice's key is 11^6 mod 23 and Bob's is 11^15 mod 23.
    expect(last.variables).toMatchObject({ alice: 9, bob: 10 });
    expect(last.title).toContain('Mallory');
    expect(`${last.title} ${last.why}`).toContain('both');
    expect(nodes(last.view)).toContain('attacker');
  });

  it('never gives Mallory the same share as either side', () => {
    for (const [a, b] of [['9', '10'], ['10', '9'], ['9', '15'], ['6', '9']] as const) {
      const steps = keyExchangeSteps({ ...defaults, attacker: 'Man in the middle', a, b });
      const shares = steps.flatMap((s) => [s.variables?.A, s.variables?.B, s.variables?.M]).filter((v) => v !== undefined);
      const mallory = steps[1]!.variables!.M;
      expect(shares.filter((v) => v === mallory).length, `${a} ${b}`).toBe(2);
    }
  });

  it('checks each secret against the chosen prime', () => {
    const steps = keyExchangeSteps({ ...defaults, a: '50' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toContain('2 to 21');
    expect(keyExchangeSteps({ ...defaults, prime: '65537', a: '50' }).length).toBeGreaterThan(1);
  });
});
