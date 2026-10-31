import { describe, expect, it } from 'vitest';
import { congestionControlSteps } from './congestion-control';
import type { ChartView, PanelsView, ServicesView, Step } from '../../types/visualization';

const run = (queue: string, ssthresh: string) => congestionControlSteps({ queue, ssthresh });
const panel = (step: Step, label: string) => (step.view as PanelsView).panels.find((each) => each.label === label)!.view;
const points = (steps: Step[]) => (panel(steps[0]!, 'Chart') as ChartView).lines[0]!.points;

describe('Congestion Control', () => {
  it('doubles cwnd per round before the first loss', () => {
    expect(points(run('40', '64')).slice(0, 6)).toEqual([1, 2, 4, 8, 16, 32]);
  });

  it('halves at least twice in the sawtooth', () => {
    const steps = run('10', '8');
    expect(steps.filter((step) => step.title.startsWith('Third duplicate')).length).toBeGreaterThanOrEqual(2);
    const halved = points(steps).filter((value, i, all) => i > 0 && value < all[i - 1]! * 0.75);
    expect(halved.length).toBeGreaterThanOrEqual(2);
  });

  it('restarts from 1 after the timeout at queue 2', () => {
    const steps = run('2', '64');
    expect(steps.some((step) => step.title.startsWith('No ACK'))).toBe(true);
    expect(points(steps).slice(1).reduce((low, value) => Math.min(low, value))).toBe(1);
  });

  it('finishes at queue 2 and ssthresh 2', () => {
    const last = run('2', '2').at(-1)!;
    expect(last.title).toContain('250000 bytes');
    expect(last.variables!.cut).toBe('no');
  });

  it('marks ssthresh on the chart', () => {
    const chart = panel(run('10', '8')[1]!, 'Chart') as ChartView;
    expect(chart.threshold).toEqual({ value: 8, label: 'ssthresh' });
  });

  it('shows the queue as the Router\'s badge', () => {
    const steps = run('10', '64');
    const badges = steps.map((step) => (panel(step, 'Network') as ServicesView).nodes.find((node) => node.id === 'router')!.badge ?? '');
    expect(badges.some((badge) => /[1-9]\d* queued/.test(badge))).toBe(true);
  });

  it('refuses a queue out of range', () => {
    expect(run('1', '64')).toHaveLength(1);
    expect(run('10', '65')).toHaveLength(1);
  });
});
