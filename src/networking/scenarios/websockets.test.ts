import { describe, expect, it } from 'vitest';
import { SCENES, websocketsSteps } from './websockets';

const run = (scene: string) => websocketsSteps({ scene });

describe('WebSockets', () => {
  it('ends the upgrade in 101', () => {
    const steps = run('Upgrade');
    expect(steps.some((step) => step.title === '101 Switching Protocols')).toBe(true);
    expect(steps.at(-1)!.title).toContain('101');
  });

  it('pushes messages with no request', () => {
    const steps = run('Server push');
    expect(steps.filter((step) => step.title.startsWith('Server sends "'))).toHaveLength(3);
    expect(steps.filter((step) => step.title.startsWith('GET ')).map((step) => step.title)).toEqual(['GET /chat with Upgrade: websocket']);
    expect(steps.at(-1)!.why).toContain('no request');
  });

  it('states packets and delay for push and polling', () => {
    const last = run('Polling compared').at(-1)!;
    const { pollPackets, pushPackets, pollBytes, pushBytes, pollDelay, pushDelay } = last.variables as Record<string, number>;
    expect(pollBytes).toBeGreaterThan(pushBytes!);
    expect(pollDelay).toBeGreaterThan(pushDelay!);
    expect(last.why).toContain(`${pollPackets}`);
    expect(last.why).toContain(`${pushPackets}`);
  });

  it('closes after 2 missed pongs', () => {
    const steps = run('Dead peer');
    expect(steps.some((step) => step.title === 'No pong after 2 pings')).toBe(true);
    expect(steps.at(-1)!.title).toContain('dead');
  });

  it('runs every scene to a tidy end', () => {
    for (const scene of SCENES) expect(run(scene).length).toBeGreaterThan(3);
  });

  it('refuses a bad scene', () => {
    expect(run('x')).toHaveLength(1);
  });
});
