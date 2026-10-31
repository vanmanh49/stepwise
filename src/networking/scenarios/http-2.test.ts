import { describe, expect, it } from 'vitest';
import type { GridView, LadderView, PanelsView, Step } from '../../types/visualization';
import { http2Steps } from './http-2';

const run = (resources: string, lost: string) => http2Steps({ resources, lost });
const panel = (step: Step, label: string) => (step.view as PanelsView).panels.find((each) => each.label === label)?.view;
const states = (step: Step) => (panel(step, 'Streams') as GridView).rows.map((row) => row.cells.at(-1)!.value);

describe('HTTP/2', () => {
  it('uses one connection for every resource', () => {
    const steps = run('4', 'None');
    expect(steps.filter((step) => step.title.startsWith('SYN from'))).toHaveLength(1);
    expect(steps.filter((step) => step.title.startsWith('GET '))).toHaveLength(4);
    expect(steps.at(-1)!.title).toContain('1 connection');
  });

  it('interleaves frames on the ladder', () => {
    const steps = run('4', 'None');
    const rows = (panel(steps.at(-2)!, 'Ladder') as LadderView).rows.map(({ label }) => label).filter((label) => label.startsWith('DATA'));
    expect(new Set(rows.slice(0, 4)).size).toBeGreaterThan(1);
  });

  it('shrinks the headers', () => {
    const steps = run('4', 'None');
    const [first, second] = steps.filter((step) => step.title.startsWith('GET ')).map((step) => Number(/cost (\d+) bytes/.exec(step.why)![1]));
    expect(second).toBeLessThan(first!);
    expect(steps.at(-1)!.why).toContain(`${first} bytes`);
  });

  it('stalls every unfinished stream on a lost segment', () => {
    const steps = run('4', 'Segment 3');
    const hold = steps.find((step) => step.title.includes('ahead of a gap'))!;
    const open = states(hold).filter((state) => state !== 'done');
    expect(open.length).toBeGreaterThan(1);
    expect(open.every((state) => state === 'stalled')).toBe(true);
    expect(steps.at(-1)!.why).toContain('stalled');
    expect(states(steps.at(-1)!).every((state) => state === 'done')).toBe(true);
  });

  it('has no drops of its own when nothing is lost', () => {
    expect(run('6', 'None').some((step) => step.title.endsWith('queue is full'))).toBe(false);
  });

  it('says nothing is encrypted', () => {
    expect(run('2', 'None').find((step) => step.title === 'ClientHello')!.why).toContain('encrypted');
  });

  it('refuses bad input', () => {
    expect(run('1', 'None')).toHaveLength(1);
    expect(run('4', 'Segment 9')).toHaveLength(1);
  });
});
