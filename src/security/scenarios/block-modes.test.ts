import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { blockModesSteps } from './block-modes';

const defaults = { scenario: 'Patterns', mode: 'ECB', shape: 'Smiley', message: 'pay $100 to bob' };

const cipherImage = (steps: Step[]) => ((steps.at(-1)!.view as PanelsView).panels[1]!.view as GridView).rows.flatMap((r) => r.cells);

describe('block modes scenario: patterns', () => {
  it('ECB leaves exactly two values, one per colour', () => {
    const cells = cipherImage(blockModesSteps(defaults));
    expect(new Set(cells.map((c) => c!.value)).size).toBe(2);
    expect([...new Set(cells.map((c) => (c as { heat: number }).heat.toFixed(2)))].toSorted()).toEqual(['0.26', '0.98']);
  });

  it.each(['CBC', 'CTR', 'GCM'])('%s hides the shape', (mode) => {
    const cells = cipherImage(blockModesSteps({ ...defaults, mode }));
    expect(new Set(cells.map((c) => c!.value)).size).toBeGreaterThan(25);
  });

  it.each(['Smiley', 'Stripes', 'Checkerboard'])('draws %s with both colours', (shape) => {
    expect(new Set(cipherImage(blockModesSteps({ ...defaults, shape })).map((c) => c!.value)).size).toBe(2);
  });

  it('reveals the picture row by row', () => {
    const steps = blockModesSteps(defaults);
    expect(steps.length).toBeGreaterThanOrEqual(8);
    expect(steps.length).toBeLessThanOrEqual(10);
  });
});

describe('block modes scenario: nonce reuse', () => {
  const run = (message: string) => blockModesSteps({ ...defaults, scenario: 'Nonce reuse', mode: 'GCM', message });

  it('recovers a short secret message in full, whatever the mode field says', () => {
    const last = run('meet me at noon').at(-1)!;
    expect(last.title).toContain('meet me at noon');
    expect(last.variables!.recovered).toBe(15);
  });

  it('recovers only as much as the known message covers', () => {
    const message = 'x'.repeat(32);
    const last = run(message).at(-1)!;
    expect(last.variables!.recovered).toBe(28);
    expect(`${last.title} ${last.why}`).toContain('28');
    expect(last.title).not.toContain(message);
  });
});

describe('block modes scenario: tampering', () => {
  const run = (message: string) => blockModesSteps({ ...defaults, scenario: 'Tampering', mode: 'ECB', message });

  it('turns $100 into $900 under CTR, and GCM refuses', () => {
    const steps = run('pay $100 to bob');
    expect(steps.map((s) => s.title).join('\n')).toContain('pay $900 to bob');
    expect(steps.at(-1)!.title).toContain('refuses');
    expect(steps.at(-1)!.variables!.result).toBe('refused');
  });

  it('flips a named bit when the message has no digit', () => {
    const steps = run('no numbers');
    const flip = steps.find((s) => s.title.startsWith('Attacker'))!;
    expect(flip.why).toContain('lowest bit of byte 0');
    expect(steps.map((s) => s.title).join('\n')).toContain('oo numbers');
  });
});

describe('block modes scenario: input', () => {
  it('refuses a message over 32 bytes, except where the message is unused', () => {
    const long = 'x'.repeat(33);
    expect(blockModesSteps({ ...defaults, scenario: 'Tampering', message: long })).toHaveLength(1);
    expect(blockModesSteps({ ...defaults, scenario: 'Nonce reuse', message: long })).toHaveLength(1);
    expect(blockModesSteps({ ...defaults, message: long }).length).toBeGreaterThan(1);
  });
});
