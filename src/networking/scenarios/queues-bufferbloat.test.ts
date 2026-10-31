import { describe, expect, it } from 'vitest';
import lesson from '../../lessons/networking/queues-bufferbloat';
import { BUFFERS, queuesBufferbloatSteps } from './queues-bufferbloat';
import type { ChartView, PanelsView, Step } from '../../types/visualization';

const [SMALL, BIG, HUGE] = BUFFERS;
const run = (buffer: string) => queuesBufferbloatSteps({ buffer });
const chart = (steps: Step[]) => (steps[0]!.view as PanelsView).panels.find((panel) => panel.label === 'Chart')!.view as ChartView;
const stat = (steps: Step[], name: string) => Number(steps.at(-1)!.variables![name]);

describe('Queues & Bufferbloat', () => {
  it('multiplies the round trip with the buffer', () => {
    expect(stat(run(HUGE!), 'peakRtt')).toBeGreaterThan(stat(run(SMALL!), 'peakRtt') * 3);
    expect(stat(run(BIG!), 'peakRtt')).toBeGreaterThan(stat(run(SMALL!), 'peakRtt'));
  });

  it('keeps throughput within 20%', () => {
    const rates = BUFFERS.map((buffer) => stat(run(buffer), 'throughput'));
    expect(Math.max(...rates) / Math.min(...rates)).toBeLessThan(1.2);
  });

  it('fills the Huge buffer, so packets are dropped and the queue reaches its limit', () => {
    const steps = run(HUGE!);
    expect(steps.some((step) => step.title.endsWith('queue is full'))).toBe(true);
    expect(Math.max(...chart(steps).lines[1]!.points)).toBeGreaterThan(900);
  });

  it('keeps the round trip above the time in queue at every point', () => {
    const { lines } = chart(run(HUGE!));
    lines[0]!.points.forEach((value, i) => expect(value).toBeGreaterThan(lines[1]!.points[i]!));
  });

  it('shows a climbing round trip in the quiz\'s step, with no packet lost yet', () => {
    const question = lesson.quiz[0]!;
    const view = (question.view as PanelsView).panels.find((panel) => panel.label === 'Chart')!.view as ChartView;
    const points = view.lines[0]!.points;
    expect(points[view.now! + 1]!).toBeGreaterThan(points[view.now!]!);
    const steps = run(HUGE!);
    expect(steps.findIndex((step) => step.title.endsWith('queue is full'))).toBeGreaterThan(view.now!);
  });

  it('charts two lines on one axis in milliseconds', () => {
    const view = chart(run(BIG!));
    expect(view.lines.map((line) => line.label)).toEqual(['Round trip', 'Time in queue']);
    expect(view.yLabel).toBe('ms');
  });

  it('stays within the step cap', () => {
    expect(run(SMALL!).length).toBeLessThanOrEqual(201);
  });

  it('refuses a buffer that is not offered', () => {
    expect(run('7')).toHaveLength(1);
  });
});
