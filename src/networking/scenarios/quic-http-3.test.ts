import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import lesson from '../../lessons/networking/quic-http-3';
import { runMux } from './http-2';
import { quicHttp3Steps } from './quic-http-3';

const run = (visit: string, resources: string, lost: string) => quicHttp3Steps({ visit, resources, lost });
const panel = (step: Step, label: string) => (step.view as PanelsView).panels.find((each) => each.label === label)?.view;
const states = (step: Step) => (panel(step, 'Streams') as GridView).rows.map((row) => row.cells.at(-1)!.value);
const firstByte = (steps: Step[]) => Number(steps.at(-1)!.variables!.firstByte);

describe('QUIC & HTTP/3', () => {
  it('beats HTTP/2 to the first byte by about a round trip, and says so at the end', () => {
    const steps = run('First', '4', 'None');
    const gained = Number(steps.at(-1)!.variables!.gained);
    expect(gained).toBeGreaterThanOrEqual(30);
    expect(gained).toBeLessThanOrEqual(63);
    expect(steps.at(-1)!.why).toContain(`${gained} ms`);
  });

  it('is sooner again on a return visit', () => {
    expect(firstByte(run('Returning', '4', 'None'))).toBeLessThan(firstByte(run('First', '4', 'None')) - 30);
  });

  it('sends the request in the first flight on a return visit', () => {
    const steps = run('Returning', '4', 'None');
    expect(steps.some((step) => step.variables?.time === '0 ms' && step.title.startsWith('GET '))).toBe(true);
  });

  it('stalls exactly one stream on a lost packet', () => {
    const steps = run('First', '4', 'Packet 3');
    const holds = steps.filter((step) => step.title.includes('waits for bytes'));
    expect(holds.length).toBeGreaterThan(0);
    for (const hold of holds) expect(states(hold).filter((state) => state === 'stalled')).toHaveLength(1);
    expect(steps.at(-1)!.variables!.stalled).toBe(1);
    expect(states(steps.at(-1)!).every((state) => state === 'done')).toBe(true);
  });

  it('stalls every stream on HTTP/2 with the same loss', () => {
    expect(run('First', '4', 'Packet 3').at(-1)!.why).toContain('HTTP/2 stalled 4');
  });

  it('recovers a lost first packet on a return visit, with the first byte still ahead of a first visit', () => {
    const steps = run('Returning', '4', 'Packet 1');
    expect(states(steps.at(-1)!).every((state) => state === 'done')).toBe(true);
    expect(firstByte(steps)).toBeLessThan(firstByte(run('First', '4', 'None')));
  });

  it('counts the same packets as HTTP/2', () => {
    expect(runMux('HTTP/3', { resources: 2, lost: 8 }).http.fetches.every(({ bytes }) => bytes === 8000)).toBe(true);
  });

  it('shows headers in the Packet panel', () => {
    const labels = run('First', '2', 'None').flatMap((step) => (panel(step, 'Packet') as GridView | undefined)?.rows.map((row) => row.label) ?? []);
    expect(labels).toEqual(expect.arrayContaining([':path', ':status']));
  });

  it('keeps the quiz from showing its own answer', () => {
    const shown = JSON.stringify(lesson.quiz[0]!.view);
    expect(shown).not.toContain('stalled');
    expect(shown).not.toContain('"sending"');
  });

  it('credits 0-RTT on a return visit', () => {
    const { why } = run('Returning', '4', 'None').at(-1)!;
    expect(why).toContain('first flight');
    expect(run('First', '4', 'None').at(-1)!.why).not.toContain('first flight');
  });

  it('refuses bad input', () => {
    expect(run('x', '4', 'None')).toHaveLength(1);
    expect(run('First', '7', 'None')).toHaveLength(1);
    expect(run('First', '4', 'Packet 9')).toHaveLength(1);
  });
});
