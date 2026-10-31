import { describe, expect, it } from 'vitest';
import { LOST_OPTIONS, reliableDeliverySteps, WINDOWS } from './reliable-delivery';
import type { Step } from '../../types/visualization';

const [W1, W4] = WINDOWS;
const NONE = LOST_OPTIONS[0]!;
const run = (segments: string, window: string, lost: string) => reliableDeliverySteps({ segments, window, lost });
const titled = (steps: Step[], text: string) => steps.filter((step) => step.title.includes(text));
const packets = (steps: Step[]) => titled(steps, ' bytes, seq ');

describe('Reliable Delivery', () => {
  it('counts bytes in the sequence numbers', () => {
    expect(packets(run('3', W4!, NONE)).map((step) => step.title)).toEqual(['1000 bytes, seq 1001', '1000 bytes, seq 2001', '1000 bytes, seq 3001']);
    expect(run('3', W4!, NONE).at(-1)!.title).toContain('3000 bytes');
  });

  it('needs the timer when the last segment is lost', () => {
    const steps = run('6', W4!, 'Segment 6');
    expect(titled(steps, 'No ACK')).toHaveLength(1);
    expect(titled(steps, 'Third duplicate')).toHaveLength(0);
    expect(steps.at(-1)!.title).toContain('6000 bytes');
  });

  it('retransmits an early loss at window 4 before the timer', () => {
    const steps = run('6', W4!, 'Segment 2');
    expect(titled(steps, 'Third duplicate')).toHaveLength(1);
    expect(titled(steps, 'No ACK')).toHaveLength(0);
    expect(titled(steps, 'ACK 2001 again')).toHaveLength(3);
  });

  it('resends nothing for a lost ACK at window 4', () => {
    const steps = run('6', W4!, 'ACK 1');
    expect(packets(steps)).toHaveLength(6);
    expect(titled(steps, 'No ACK')).toHaveLength(0);
    expect(titled(steps, 'Third duplicate')).toHaveLength(0);
  });

  it('takes longer at window 1 than window 4', () => {
    const time = (steps: Step[]) => Number(steps.at(-1)!.variables!.ms);
    expect(time(run('6', W1!, NONE))).toBeGreaterThan(time(run('6', W4!, NONE)));
  });

  it('refuses a lost segment past the end of the run', () => {
    const steps = run('3', W4!, 'Segment 8');
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toContain('1 to 3');
  });

  it('refuses a bad segment count', () => {
    expect(run('9', W4!, NONE)).toHaveLength(1);
  });
});
