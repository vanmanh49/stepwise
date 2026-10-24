import { describe, expect, it } from 'vitest';
import type { ClusterView } from '../../types/visualization';
import { labelsSelectorsSteps, readSelector } from './labels-selectors';

const web = { key: 'app', op: '=', values: 'web' };
const last = (values: typeof web) => labelsSelectorsSteps(values).at(-1)!;

describe('Labels & Selectors', () => {
  it.each([
    [web, 3, 'app=web'],
    [{ key: 'tier', op: 'in', values: 'fe, be' }, 6, 'tier in (fe,be)'],
    [{ key: 'env', op: '!=', values: 'prod' }, 3, 'env!=prod'],
    [{ key: 'app', op: '=', values: 'wbe' }, 0, 'app=wbe'],
    [{ key: 'track', op: 'exists', values: '' }, 1, 'track'],
    [{ key: 'env', op: 'notin', values: 'prod,dev' }, 1, 'env notin (prod,dev)'],
  ])('%o matches %i of 6 pods', (values, count, selector) => {
    expect(last(values).title).toBe(`${count} of 6 pods match ${selector}`);
    const view = last(values).view as ClusterView;
    expect(view.nodes.flatMap((n) => n.pods).filter((p) => p.role === 'found')).toHaveLength(count);
  });

  it('checks one pod per step, in name order, and names the label that decided', () => {
    const steps = labelsSelectorsSteps(web);
    expect(steps).toHaveLength(8);
    expect(steps.slice(1, 7).map((s) => s.title)).toEqual([
    "api-a1 doesn't match: app=web fails (app is api)",
      "api-b2 doesn't match: app=web fails (app is api)",
      "db-a1 doesn't match: app=web fails (app is db)",
      'web-a1 matches app=web',
      'web-b2 matches app=web',
      'web-c3 matches app=web',
    ]);
    const third = steps[3]!.view as ClusterView;
    const roles = Object.fromEntries(third.nodes.flatMap((n) => n.pods.map((p) => [p.name, p.role])));
    expect(roles).toMatchObject({ 'api-a1': 'discarded', 'api-b2': 'discarded', 'db-a1': 'active', 'web-a1': 'default' });
  });

  it('matches a pod with no env label under env!=prod, and says so', () => {
    const steps = labelsSelectorsSteps({ key: 'env', op: '!=', values: 'prod' });
    const c3 = steps.find((s) => s.title.startsWith('web-c3'))!;
    expect(c3.title).toBe('web-c3 matches env!=prod');
    expect(c3.why).toContain('has no env label');
  });

  it('shows each pod\'s labels', () => {
    const view = labelsSelectorsSteps(web)[0]!.view as ClusterView;
    expect(view.nodes.flatMap((n) => n.pods).find((p) => p.name === 'web-c3')!.badge).toBe('app=web, tier=fe, track=canary');
  });

  it('refuses unusable selectors', () => {
    for (const [values, why] of [
      [{ key: 'app', op: 'in', values: '' }, 'in needs 1 to 3 values'],
      [{ key: 'app', op: '=', values: 'web,api' }, '= takes exactly one value'],
      [{ key: 'app', op: '=', values: 'Web!' }, 'Values use 1 to 12 lowercase letters, digits or dashes'],
      [{ key: 'app', op: 'in', values: 'a,b,c,d' }, 'in needs 1 to 3 values'],
      [{ key: 'zone', op: '=', values: 'a' }, 'Label key must be one of'],
    ] as const) {
      const read = readSelector(values);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.why).toContain(why);
      const steps = labelsSelectorsSteps(values);
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't use this selector");
    }
  });

  it('ignores values for exists', () => {
    expect(readSelector({ key: 'track', op: 'exists', values: 'whatever' })).toEqual({ ok: true, value: [{ key: 'track', op: 'exists', values: [] }] });
  });
});
