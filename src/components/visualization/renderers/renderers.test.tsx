import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allLessons, defaultSteps } from '../../../lessons/all.testutil';
import type { View } from '../../../types/visualization';
import { StepView } from '.';

const draw = (view: View) => renderToString(<StepView view={view} />);

describe('every lesson draws', () => {
  // First and last steps only: drawing every step of every lesson takes about 40 seconds.
  it.each(allLessons.map((lesson) => [lesson.id, lesson] as const))('%s', (_, lesson) => {
    const steps = defaultSteps(lesson);
    const views = [steps[0]!.view, steps.at(-1)!.view, ...lesson.quiz.flatMap((q) => q.view ?? [])];
    for (const view of views) expect(draw(view)).not.toMatch(/NaN|undefined|\[object Object\]/);
  });
});

describe('ladder', () => {
  const view: View = {
    kind: 'ladder',
    columns: [{ id: 'c', label: 'Client', state: 'SYN_SENT' }, { id: 's', label: 'Server' }],
    rows: [
      { id: 'r1', from: 'c', to: 's', label: 'SYN seq=1000', role: 'active' },
      { id: 'r2', from: 's', to: 'c', label: 'SYN ACK', role: 'discarded', lost: true },
    ],
    earlier: 3,
  };

  it('names every packet, its direction and its loss for a screen reader', () => {
    const html = draw(view).replaceAll('<!-- -->', '');
    expect(html).toContain('SYN_SENT');
    expect(html).toContain('3 earlier');
    expect(html).toContain('Client to Server');
    expect(html).toContain('Server to Client');
    expect(html).toContain('lost');
  });

  it('stops a lost packet halfway across', () => {
    expect(draw(view)).toMatch(/width:25%/);
  });
});

describe('ladder on narrow columns', () => {
  const columns = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id }));
  const row = (from: string, to: string) => draw({ kind: 'ladder', columns, rows: [{ id: 'r', from, to, label: 'SYN ACK', role: 'default' }] });

  it('keeps an outer hop\'s label inside the figure', () => {
    expect(row('a', 'b')).toMatch(/style="left:0"[^>]*>SYN ACK/);
    expect(row('c', 'd')).toMatch(/style="right:0"[^>]*>SYN ACK/);
  });

  it('centres a middle hop\'s label on its arrow', () => {
    expect(row('b', 'c')).toMatch(/-translate-x-1\/2[^>]*style="left:50%"[^>]*>SYN ACK/);
  });

  it('draws a plain row\'s arrow in text ink, not the faint border colour', () => {
    expect(row('a', 'b')).toContain('var(--text-muted)');
  });
});

describe('chart', () => {
  const view: View = {
    kind: 'chart',
    title: 'Window',
    xLabel: 'Round',
    yLabel: 'Segments',
    lines: [
      { id: 'a', label: 'cwnd', points: [1, 2, 4, 8], role: 'active' },
      { id: 'b', label: 'Queue', points: [0, 0, 1, 3], role: 'pivot' },
    ],
    threshold: { value: 6, label: 'ssthresh' },
    now: 2,
  };

  it('states each line at the current point', () => {
    const html = draw(view);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Window: cwnd 4, Queue 1"');
  });

  it('dashes the second line, so colour is not the only cue', () => {
    expect((draw(view).match(/stroke-dasharray/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('draws only up to now', () => {
    expect(draw(view)).not.toMatch(/aria-label="[^"]*cwnd 8/);
  });

  it('scales to the lines, leaving out a threshold far above them', () => {
    const html = draw({ ...view, threshold: { value: 64, label: 'ssthresh' } });
    expect(html).not.toContain('ssthresh');
    expect(html).toMatch(/>8<\/text>/);
  });

  it('keeps the same scale when the threshold changes', () => {
    const top = (value: number) => /text-anchor="end"[^>]*>([\d.]+)</.exec(draw({ ...view, threshold: { value, label: 'ssthresh' } }))![1];
    expect(top(64)).toBe(top(2));
  });

  it('draws a one-point line with no NaN', () => {
    expect(draw({ ...view, lines: [{ id: 'a', label: 'cwnd', points: [0], role: 'active' }], now: 0 })).not.toContain('NaN');
  });
});
