import { describe, expect, it } from 'vitest';
import { flowControlSteps } from './flow-control';
import type { Step } from '../../types/visualization';

const run = (buffer: string, rate: string) => flowControlSteps({ buffer, rate });
const windows = (steps: Step[]) => steps.flatMap((step) => /window (\d+)/.exec(step.title)?.[1] ?? []).map(Number);
const titled = (steps: Step[], text: string) => steps.filter((step) => step.title.includes(text));

describe('Flow Control', () => {
  it('keeps a fast reader\'s window near the buffer', () => {
    expect(Math.min(...windows(run('8000', '200')))).toBeGreaterThanOrEqual(6000);
  });

  it('shrinks a slow reader\'s window', () => {
    const shown = windows(run('8000', '20'));
    expect(Math.min(...shown)).toBeLessThan(3000);
  });

  it('takes longer behind a slow reader', () => {
    const time = (steps: Step[]) => Number(steps.at(-1)!.variables!.ms);
    expect(time(run('8000', '20'))).toBeGreaterThan(time(run('8000', '200')) * 3);
  });

  it('shows a paused reader reach 0, probe, and resume at 2 s', () => {
    const steps = run('8000', '0');
    expect(titled(steps, 'window 0').length).toBeGreaterThan(0);
    expect(titled(steps, 'A 1-byte probe').length).toBeGreaterThan(0);
    const update = titled(steps, 'Window update')[0]!;
    expect(parseFloat(String(update.variables!.time))).toBeGreaterThanOrEqual(2);
    expect(parseFloat(String(update.variables!.time))).toBeLessThan(2.02);
  });

  it('finishes with every byte read at buffer 2000 and rate 0', () => {
    expect(run('2000', '0').at(-1)!.title).toContain('16000 bytes');
  });

  it('says the window closed only when it did', () => {
    expect(run('2000', '0').at(-1)!.why).toContain('reached 0');
    for (const rate of ['0', '1']) {
      const { why } = run('64000', rate).at(-1)!;
      expect(why).not.toContain('reached 0');
      expect(why).not.toContain('probing');
      expect(why).toContain('never came close to filling');
    }
  });

  it('says when the window held the sender back', () => {
    expect(run('8000', '20').at(-1)!.why).toContain('20 bytes per ms');
    expect(run('8000', '20').at(-1)!.why).toContain('shrank');
  });

  it('writes one byte in the singular', () => {
    expect(run('2000', '1').at(-1)!.why).not.toContain('1 bytes');
  });

  it('refuses a read rate out of range', () => {
    expect(run('8000', '500')).toHaveLength(1);
    expect(run('100', '20')).toHaveLength(1);
  });
});
