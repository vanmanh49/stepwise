import { describe, expect, it } from 'vitest';
import type { PanelsView, ServicesView, Step } from '../../types/visualization';
import { cdnAnycastSteps } from './cdn-anycast';

const run = (scene: string, moment = 'During a transfer') => cdnAnycastSteps({ scene, moment });
const titles = (steps: Step[]) => steps.map((step) => step.title);
const reached = (steps: Step[], device: string) => steps.some((step) => step.variables?.device === device);

describe('CDNs & Anycast', () => {
  it('reaches the origin on a miss', () => {
    const steps = run('Cache miss');
    expect(titles(steps)).toContain('Cache miss for /index.html');
    expect(reached(steps, 'Origin')).toBe(true);
    expect(steps.at(-1)!.variables!.xCache).toBe('MISS');
  });

  it('skips the origin on a hit, and sets Age', () => {
    const steps = run('Cache hit');
    const last = steps.at(-1)!;
    expect(last.variables!.xCache).toBe('HIT');
    expect(Number(last.variables!.age)).toBeGreaterThan(0);
    const hitAt = steps.findIndex((step) => step.title.startsWith('Cache hit'));
    expect(steps.slice(hitAt).some((step) => step.variables?.device === 'Origin')).toBe(false);
  });

  it('sends the client to the nearer edge', () => {
    const steps = run('Nearest edge');
    expect(reached(steps, 'Near edge')).toBe(true);
    expect(reached(steps, 'Far edge')).toBe(false);
    expect(steps.at(-1)!.why).toContain('metric');
  });

  it('resets a transfer when the edge fails, and retries on the other', () => {
    const steps = run('Edge fails');
    expect(titles(steps).some((title) => title.startsWith('RST'))).toBe(true);
    expect(titles(steps).some((title) => title.includes('requested again'))).toBe(true);
    expect(steps.at(-1)!.variables!.status).toBe(200);
    expect(reached(steps, 'Far edge')).toBe(true);
  });

  it('gets no RST when no connection is open, just a miss at the other edge', () => {
    const steps = run('Edge fails', 'Between requests');
    expect(titles(steps).some((title) => title.startsWith('RST'))).toBe(false);
    expect(titles(steps).filter((title) => title.startsWith('Cache miss'))).toHaveLength(2);
    expect(steps.at(-1)!.variables!.status).toBe(200);
  });

  it('draws at most 6 nodes', () => {
    const view = (run('Cache miss')[1]!.view as PanelsView).panels[0]!.view as ServicesView;
    expect(view.nodes.length).toBeLessThanOrEqual(6);
  });

  it('refuses bad input', () => {
    expect(run('x')).toHaveLength(1);
    expect(run('Cache hit', 'x')).toHaveLength(1);
  });
});
