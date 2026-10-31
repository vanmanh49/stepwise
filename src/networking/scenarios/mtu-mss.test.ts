import { describe, expect, it } from 'vitest';
import { MTUS, mtuMssSteps, SCENES } from './mtu-mss';
import type { Step } from '../../types/visualization';

const [AGREED, SPLIT, NEEDED, HOLE] = SCENES;
const run = (scene: string, mtu = '1000') => mtuMssSteps({ scene, mtu });
const titled = (steps: Step[], text: string) => steps.filter((step) => step.title.includes(text));

describe('MTU & MSS', () => {
  it('agrees on the smaller MSS', () => {
    const steps = run(AGREED!);
    expect(steps.at(-1)!.title).toContain('1360');
    expect(titled(steps, 'SYN from port')[0]!.why).toContain('1460');
    expect(titled(steps, 'SYN ACK')[0]!.why).toContain('1360');
  });

  it('splits 1400 bytes without df, and reassembles them', () => {
    const steps = run(SPLIT!);
    expect(titled(steps, 'sends a fragment').map((step) => step.title)).toEqual(['R1 sends a fragment of 996 bytes, offset 0', 'R1 sends a fragment of 424 bytes, offset 976']);
    expect(titled(steps, 'joins 2 fragments')).toHaveLength(1);
    expect(titled(steps, 'dns got')).toHaveLength(1);
  });

  it('splits into 3 at MTU 576', () => {
    expect(titled(run(SPLIT!, '576'), 'sends a fragment')).toHaveLength(3);
  });

  it('lowers the MSS to 960 on Fragmentation Needed, and the data arrives', () => {
    const steps = run(NEEDED!);
    expect(titled(steps, "won't fit: Fragmentation Needed")).toHaveLength(1);
    expect(titled(steps, 'MSS lowered to 960')).toHaveLength(1);
    expect(steps.at(-1)!.title).toContain('2000 bytes');
  });

  it('completes the handshake in a black hole, then aborts after 5 retries', () => {
    const steps = run(HOLE!);
    expect(titled(steps, 'The server is connected')).toHaveLength(1);
    expect(titled(steps, 'says nothing').length).toBeGreaterThanOrEqual(6);
    expect(titled(steps, 'No ACK')).toHaveLength(5);
    expect(titled(steps, 'Giving up')).toHaveLength(1);
  });

  it('tells the true story of a black hole\'s end', () => {
    const steps = run(HOLE!);
    expect(titled(steps, 'RST from')[0]!.why).not.toContain('no such connection');
    expect(steps.at(-1)!.title).not.toContain('no error');
  });

  it.each([NEEDED!, HOLE!])('says nothing was too big on %s at 1500', (scene) => {
    const steps = run(scene, '1500');
    expect(steps.at(-1)!.title).toContain('Nothing was too big');
    expect(titled(steps, 'Fragmentation Needed')).toHaveLength(0);
    expect(titled(steps, 'says nothing')).toHaveLength(0);
    expect(titled(steps, 'Giving up')).toHaveLength(0);
  });

  it('sends a datagram whole when it fits', () => {
    const steps = run(SPLIT!, '1500');
    expect(titled(steps, 'sends a fragment')).toHaveLength(0);
    expect(steps.at(-1)!.title).toContain('Nothing was too big');
  });

  it('offers the three MTUs', () => {
    expect(MTUS).toEqual(['576', '1000', '1500']);
  });

  it('refuses an unknown MTU', () => {
    expect(run(SPLIT!, '999')).toHaveLength(1);
  });
});
