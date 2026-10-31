import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { LAYERS, threatModelingSteps } from './threat-modeling';

const ORDER = ['encoding', 'csp', 'httpOnly', 'roleCheck', 'egress'];
const STAGE: Record<string, string> = { encoding: 'comment', csp: 'comment', httpOnly: 'cookie', roleCheck: 'admin', egress: 'export' };

const settings = (on: string[]) => Object.fromEntries(ORDER.map((layer) => [layer, on.includes(layer) ? 'On' : 'Off']));
const run = (on: string[]) => threatModelingSteps(settings(on));
const last = (steps: Step[]) => steps.at(-1)!;

const every = Array.from({ length: 32 }, (_, mask) => ORDER.filter((_layer, i) => mask & (1 << i)));

describe('threat modeling', () => {
  it('names the layers in the order they meet the attack', () => {
    expect(LAYERS.map((layer) => layer.name)).toEqual(ORDER);
  });

  it.each(every.map((on) => [on.join(' ') || 'nothing', on] as const))('with %s on, stops at the first layer on', (_name, on) => {
    const step = last(run(on));
    if (on.length === 0) {
      expect(step.variables).toMatchObject({ stage: 'out', result: 'attacker in' });
    } else {
      const first = ORDER.find((layer) => on.includes(layer))!;
      expect(step.variables).toMatchObject({ stage: STAGE[first], result: 'stopped', stoppedBy: first });
    }
  });

  it.each(every.filter((on) => on.length > 0).map((on) => [on.join(' '), on] as const))('with %s on, lists the later layers', (_name, on) => {
    const later = ORDER.filter((layer) => on.includes(layer)).slice(1);
    const { why, variables } = last(run(on));
    expect(variables!.alsoHeld).toBe(later.join(', ') || 'none');
    for (const layer of later) expect(why).toContain(LAYERS.find((l) => l.name === layer)!.label);
  });

  it('puts the users table at evil.example when every layer is off', () => {
    expect(last(run([])).why).toContain('root');
    expect(last(run([])).why).toContain('evil.example');
  });

  it.each(every.filter((on) => on.length > 0).map((on) => [on.join(' '), on] as const))('never lets the table out with %s on', (_name, on) => {
    expect(last(run(on)).why).not.toContain('holds the users table');
  });

  it('uses the stolen cookie, not a password', () => {
    expect(run(['roleCheck']).map((step) => step.why).join(' ')).toContain('alice');
  });

  it('refuses bad knobs with one step', () => {
    expect(threatModelingSteps({ ...settings([]), csp: 'nope' })).toHaveLength(1);
  });
});
