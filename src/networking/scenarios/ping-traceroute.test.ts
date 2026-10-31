import { describe, expect, it } from 'vitest';
import { DROP_OPTIONS, MODES, pingTracerouteSteps, SILENT_OPTIONS } from './ping-traceroute';
import type { GridView, PanelsView, Step } from '../../types/visualization';

const [PING, TRACE] = MODES;
const defaults = { mode: PING!, ttl: '64', drop: DROP_OPTIONS[0]!, silent: SILENT_OPTIONS[0]! };
const run = (overrides: Record<string, string> = {}) => pingTracerouteSteps({ ...defaults, ...overrides });

const hopList = (step: Step) => {
  const view = (step.view as PanelsView).panels.find((panel) => panel.label === 'Hops')!.view as GridView;
  return view.rows.map((row) => row.cells.map((cell) => cell?.value));
};

describe('Ping & Traceroute', () => {
  it('reports 3 of 3 with round-trip times', () => {
    const last = run().at(-1)!;
    expect(last.title).toContain('3 of 3');
    const view = (last.view as PanelsView).panels.find((panel) => panel.label === 'Replies')!.view as GridView;
    expect(view.rows).toHaveLength(3);
  });

  it('reports 2 of 3 when one reply is lost', () => {
    expect(run({ drop: '2' }).at(-1)!.title).toContain('2 of 3');
  });

  it('shows a lost reply on the wire only once', () => {
    const lost = run({ drop: '1' }).filter((step) => (step.view as PanelsView).panels[0]!.view.kind === 'services' && JSON.stringify(step.view).includes('"progress":0.25'));
    expect(lost).toHaveLength(1);
  });

  it('says so when a packet is lost', () => {
    const lost = run({ drop: '1' }).find((step) => JSON.stringify(step.view).includes('"progress":0.25'))!;
    expect(lost.why).toContain('lost');
  });

  it('reports Time Exceeded from R1 at a TTL of 1 and from R2 at a TTL of 2', () => {
    expect(run({ ttl: '1' }).map((step) => step.title).join()).toContain('Time Exceeded from 10.1.0.1');
    expect(run({ ttl: '2' }).map((step) => step.title).join()).toContain('Time Exceeded from 10.12.0.2');
    expect(run({ ttl: '1' }).at(-1)!.title).toContain('0 of 3');
  });

  it('lists every hop in order', () => {
    const last = run({ mode: TRACE! }).at(-1)!;
    expect(last.title).toContain('4 hops');
    expect(hopList(last).map((row) => row[1])).toEqual(['10.1.0.1', '10.12.0.2', '10.23.0.2', '10.3.0.2']);
  });

  it('shows a silent router as a star and still reaches the server', () => {
    const last = run({ mode: TRACE!, silent: SILENT_OPTIONS[1]! }).at(-1)!;
    expect(hopList(last).map((row) => row[1])).toEqual(['10.1.0.1', '*', '10.23.0.2', '10.3.0.2']);
    expect(last.title).toContain('4 hops');
  });

  it('refuses a TTL out of range', () => {
    expect(run({ ttl: '0' })).toHaveLength(1);
    expect(run({ ttl: '65' })).toHaveLength(1);
  });
});
