import { describe, expect, it } from 'vitest';
import type { GridView, LadderView, PanelsView, Step } from '../../types/visualization';
import { http11Steps } from './http-1-1';

const run = (resources: string, connections: string, keepAlive: string) => http11Steps({ resources, connections, keepAlive });
const packetRows = (steps: Step[]) => steps.flatMap((step) => ((step.view as PanelsView).panels.find((each) => each.label === 'Packet')?.view as GridView | undefined)?.rows.map((row) => row.label) ?? []);
const handshakes = (steps: Step[]) => steps.filter((step) => step.title.startsWith('SYN from')).length;
const doneAt = (steps: Step[]) => Number(steps.at(-1)!.variables!.finished);

describe('HTTP/1.1', () => {
  it('opens one connection per resource without keep-alive', () => {
    expect(handshakes(run('4', '1', 'No'))).toBe(4);
  });

  it('reuses one connection with keep-alive', () => {
    const steps = run('4', '1', 'Yes');
    expect(handshakes(steps)).toBe(1);
    expect(steps.filter((step) => step.title.startsWith('GET '))).toHaveLength(4);
  });

  it('finishes sooner on six connections than on one', () => {
    expect(doneAt(run('4', '6', 'Yes'))).toBeLessThan(doneAt(run('4', '1', 'Yes')));
  });

  it('opens one connection for one resource, whatever the limit', () => {
    expect(handshakes(run('1', '6', 'Yes'))).toBe(1);
  });

  it('shows the requests on a ladder, with real names', () => {
    const steps = run('2', '1', 'Yes');
    const ladder = (steps.at(-2)!.view as PanelsView).panels.find((panel) => panel.label === 'Ladder')!.view as LadderView;
    expect(ladder.rows.some(({ label }) => label === 'GET /2.js')).toBe(true);
    expect(ladder.rows.some(({ label }) => label === '200 OK')).toBe(true);
  });

  it('names the slow first response in the closing step', () => {
    expect(run('4', '1', 'Yes').at(-1)!.why).toContain('100 ms');
  });

  it('shows real headers in the Packet panel', () => {
    expect(packetRows(run('1', '1', 'Yes'))).toEqual(expect.arrayContaining(['User-Agent', 'Connection', 'Content-Type', 'Content-Length']));
  });

  it('says nothing worked around a slow file when connections ran one at a time', () => {
    const { why } = run('4', '1', 'No').at(-1)!;
    expect(why).not.toContain('kept working around');
    expect(why).toContain('had to wait');
  });

  it('says the others worked around it on six connections', () => {
    expect(run('4', '6', 'Yes').at(-1)!.why).toContain('kept working around');
  });

  it('refuses bad input', () => {
    expect(run('9', '1', 'Yes')).toHaveLength(1);
    expect(run('4', '2', 'Yes')).toHaveLength(1);
    expect(run('4', '1', 'x')).toHaveLength(1);
  });
});
