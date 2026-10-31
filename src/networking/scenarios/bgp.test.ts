import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, ServicesView, Step } from '../../types/visualization';
import { bgpSteps } from './bgp';

const run = (scene: string) => bgpSteps({ scene });
const panel = (step: Step, label: string) => (step.view as PanelsView).panels.find((each) => each.label === label)?.view;
const titles = (steps: Step[]) => steps.map((step) => step.title);

describe('BGP', () => {
  it('spreads the route, with AS_PATH growing per AS', () => {
    const last = run('Shortest path').at(-1)!;
    expect(last.variables!.path).toBe('65010 65001');
    expect(titles(run('Shortest path')).some((title) => title.includes('via 65001'))).toBe(true);
  });

  it('shows an AS routes table and the network map', () => {
    const steps = run('Shortest path');
    const step = steps.find((each) => panel(each, 'AS routes'))!;
    expect((panel(step, 'AS routes') as GridView).colLabels).toEqual(['Prefix', 'AS_PATH', 'Via', 'Pref']);
    const map = panel(steps[0]!, 'Network') as ServicesView;
    expect(map.nodes.every((node) => node.type === 'as')).toBe(true);
    expect(map.nodes.length).toBeLessThanOrEqual(6);
  });

  it('reroutes the probe after a withdraw', () => {
    const steps = run('Link fails');
    expect(titles(steps).some((title) => title.includes('to forget'))).toBe(true);
    expect(steps.at(-1)!.variables!.path).toBe('65020 65030 65001');
    expect(steps.at(-1)!.why).toContain('Transit B');
  });

  it('moves the probe by prepending', () => {
    const last = run('Prepending').at(-1)!;
    expect(last.variables!.path).toBe('65020 65030 65001');
  });

  it('captures the probe with a more specific prefix', () => {
    const last = run('Hijack').at(-1)!;
    expect(last.variables!.deliveredTo).toBe('Hijacker');
    expect(last.why).toContain('/25');
  });

  it('says real BGP runs on TCP', () => {
    expect(run('Shortest path').at(-1)!.why).toContain('TCP port 179');
  });

  it('refuses a bad scene', () => {
    expect(run('x')).toHaveLength(1);
  });
});
