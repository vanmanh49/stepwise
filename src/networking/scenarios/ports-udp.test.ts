import { describe, expect, it } from 'vitest';
import { portsUdpSteps, SCENES } from './ports-udp';
import type { Step } from '../../types/visualization';

const [PICKS, TWO, CLOSED, LOST] = SCENES;
const run = (scene: string, port = '53') => portsUdpSteps({ scene: scene!, port });
const titled = (steps: Step[], text: string) => steps.filter((step) => step.title.includes(text));

describe('Ports & UDP', () => {
  it('sends port 53 to dns and port 7 to echo', () => {
    expect(titled(run(PICKS!, '53'), 'dns got')).toHaveLength(1);
    expect(titled(run(PICKS!, '7'), 'echo got')).toHaveLength(1);
  });

  it('reaches both programs on one host', () => {
    const steps = run(TWO!);
    expect(titled(steps, 'dns got')).toHaveLength(1);
    expect(titled(steps, 'echo got')).toHaveLength(1);
  });

  it('answers a closed port with Port Unreachable', () => {
    const steps = run(CLOSED!, '9999');
    expect(titled(steps, 'Nothing is bound to port 9999')).toHaveLength(1);
    expect(titled(steps, 'Port Unreachable')).toHaveLength(1);
  });

  it.each(['53', '7'])('lets the program answer normally on Closed port at %s', (port) => {
    const steps = run(CLOSED!, port);
    expect(titled(steps, 'Port Unreachable')).toHaveLength(0);
    expect(titled(steps, 'Nothing is bound')).toHaveLength(0);
    expect(titled(steps, 'got "')).toHaveLength(2);
    expect(steps.at(-1)!.title).toContain('open');
  });

  it('ends a lost datagram with nobody told', () => {
    const steps = run(LOST!);
    expect(JSON.stringify(steps)).toContain('"progress":0.25');
    expect(titled(steps, 'got "')).toHaveLength(0);
    expect(steps.at(-1)!.title).toContain('Nobody');
  });

  it('refuses a port out of range', () => {
    const steps = run(PICKS!, '70000');
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toContain('65535');
  });
});
