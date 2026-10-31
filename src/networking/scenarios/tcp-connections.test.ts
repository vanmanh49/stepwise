import { describe, expect, it } from 'vitest';
import { CLOSERS, SCENES, tcpConnectionsSteps } from './tcp-connections';
import type { LadderView, PanelsView, Step } from '../../types/visualization';

const [OPEN, REFUSED, LOST] = SCENES;
const run = (scene: string, closer = CLOSERS[0]!) => tcpConnectionsSteps({ scene, closer });
const ladder = (step: Step) => (step.view as PanelsView).panels.find((panel) => panel.label === 'Ladder')!.view as LadderView;
const titled = (steps: Step[], text: string) => steps.filter((step) => step.title.includes(text));
const states = (steps: Step[], column: number) => [...new Set(steps.map((step) => ladder(step).columns[column]!.state).filter(Boolean))];

describe('TCP Connections', () => {
  it('opens with 3 rows on the ladder', () => {
    const steps = run(OPEN!);
    const connected = steps.findIndex((step) => step.title.includes('The server is connected'));
    expect(ladder(steps[connected]!).rows.map((row) => row.label)).toEqual(['SYN seq=1000', 'SYN ACK seq=5000 ack=1001', 'ACK ack=5001 win=64000']);
  });

  it('puts TIME_WAIT on the client when the client closes', () => {
    const steps = run(OPEN!, CLOSERS[0]);
    expect(states(steps, 0)).toContain('TIME_WAIT');
    expect(states(steps, 1)).not.toContain('TIME_WAIT');
  });

  it('puts TIME_WAIT on the server when the server closes', () => {
    const steps = run(OPEN!, CLOSERS[1]);
    expect(states(steps, 1)).toContain('TIME_WAIT');
    expect(states(steps, 0)).not.toContain('TIME_WAIT');
  });

  it('ends a refused connection with RST', () => {
    const steps = run(REFUSED!);
    expect(ladder(steps.at(-1)!).rows.map((row) => row.label)).toEqual(['SYN seq=1000', 'RST']);
    expect(ladder(steps.at(-1)!).columns[0]!.state).toBe('CLOSED');
    expect(steps.at(-1)!.title).toContain('refused');
  });

  it('resends a lost SYN at 1000 ms', () => {
    const steps = run(LOST!);
    const again = titled(steps, 'No ACK')[0]!;
    expect(again.variables?.time).toBe('1 s');
    expect(ladder(steps.at(-1)!).rows.some((row) => row.lost)).toBe(true);
  });

  it('refuses an unknown scene', () => {
    expect(run('Nope')).toHaveLength(1);
  });
});
