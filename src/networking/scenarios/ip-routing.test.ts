import { describe, expect, it } from 'vitest';
import { ipRoutingSteps, LINK_OPTIONS, ROUTE_OPTIONS } from './ip-routing';
import { threeRouters } from './topology';
import type { GridView, PanelsView, Step } from '../../types/visualization';

const [UP, DOWN] = LINK_OPTIONS;
const [CORRECT, LOOP] = ROUTE_OPTIONS;
const run = (destination: string, link = UP!, routes = CORRECT!) => ipRoutingSteps({ destination, link, routes });
const titles = (steps: Step[]) => steps.map((step) => step.title);
const packet = (step: Step) => {
  const view = (step.view as PanelsView).panels.find((panel) => panel.label === 'Packet')?.view as GridView | undefined;
  return Object.fromEntries((view?.rows ?? []).map((row) => [row.label, row.cells[0]!.value]));
};

describe('Routing Tables', () => {
  it('prefers the /24 over the /8', () => {
    expect(titles(run('10.3.0.2'))).toContain('10.3.0.2 matches 10.3.0.0/24');
  });

  it('falls to the /8 for another 10.x address', () => {
    expect(titles(run('10.9.0.1'))).toContain('10.9.0.1 matches 10.0.0.0/8');
  });

  it('keeps the IPs across hops while the MACs change', () => {
    const hops = run('10.3.0.2').filter((step) => step.title.includes('forwards it')).slice(0, 3);
    expect(hops).toHaveLength(3);
    expect(new Set(hops.map((step) => packet(step)['Source IP'])).size).toBe(1);
    expect(new Set(hops.map((step) => packet(step)['Destination IP'])).size).toBe(1);
    expect(new Set(hops.map((step) => packet(step)['Source MAC'])).size).toBe(3);
  });

  it('reaches a network only a default route knows', () => {
    const list = titles(run('192.0.2.10'));
    expect(list).toContain('192.0.2.10 matches 0.0.0.0/0');
    expect(list.join()).toContain('Web answers');
  });

  it('ends with Unreachable from R3 when nobody has a route', () => {
    const steps = run('198.51.100.7');
    expect(titles(steps).join()).toContain('R3 has no route');
    expect(steps.at(-1)!.title).toContain('Destination Unreachable');
    expect(steps.at(-1)!.title).toContain('10.23.0.2');
  });

  it('takes the backup route when the link is down', () => {
    const steps = run('10.3.0.2', DOWN);
    const hop = steps.find((step) => step.title.includes('R1 forwards it'))!;
    expect(packet(hop)['Destination MAC']).toBe('aa:00:00:00:00:34');
    expect(titles(steps).join()).toContain('Server answers');
  });

  it('ends a loop in Time Exceeded after 8 hops', () => {
    const steps = run('192.0.2.10', UP, LOOP);
    expect(steps.filter((step) => step.title.includes('forwards it') && packet(step)['ICMP']?.startsWith('Echo Request'))).toHaveLength(7);
    expect(steps.at(-1)!.title).toContain('Time Exceeded');
  });

  it('delivers to itself with no router', () => {
    const steps = run('10.1.0.2');
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(titles(steps).join()).not.toContain('forwards');
  });

  it('gets an answer from a router\'s own interface', () => {
    expect(titles(run('10.12.0.2')).join()).toContain('R2 answers');
  });

  it('refuses a bad address', () => {
    expect(run('10.3.0')).toHaveLength(1);
  });
});

describe('the backup layout', () => {
  it('keeps R2 off the direct R1–R3 link', () => {
    const { devices } = threeRouters({ backup: true });
    const column = (id: string) => devices.find((device) => device.id === id)!.column;
    expect(column('r2')).toBe(column('r3'));
    expect(column('server')).toBeGreaterThan(column('r3'));
  });
});
