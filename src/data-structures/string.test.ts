import { describe, expect, it } from 'vitest';
import type { Step } from '../types/visualization';
import { stringStructure } from './string';

function run(opId: string, text: string, arg = '') {
  const op = stringStructure.ops.find((o) => o.id === opId);
  if (!op) throw new Error(`no op ${opId}`);
  return op.run(text, arg);
}

const cells = (step: Step) => (step.view.kind === 'array' ? step.view.cells : []);
const withRole = (step: Step, role: string) => cells(step).filter((c) => c.role === role);

describe('charAt', () => {
  it('reads a character without changing the text', () => {
    const result = run('charAt', 'LEVEL', '1');
    expect(result.text).toBe('LEVEL');
    expect(cells(result.steps.at(-1)!)[1]!.role).toBe('found');
  });

  it.each(['9', 'x', '-1', '', '1.5'])('explains the invalid index %j in one step', (arg) => {
    const result = run('charAt', 'LEVEL', arg);
    expect(result.steps).toHaveLength(1);
    expect(result.text).toBe('LEVEL');
  });
});

describe('concat', () => {
  it('builds a new string from both parts', () => {
    expect(run('concat', 'AB', 'CD').text).toBe('ABCD');
  });

  it('refuses a result longer than 12 characters', () => {
    const result = run('concat', 'ABCDEFGHIJK', 'XY');
    expect(result.steps).toHaveLength(1);
    expect(result.text).toBe('ABCDEFGHIJK');
  });

  it('refuses an empty addition', () => {
    const result = run('concat', 'AB', '');
    expect(result.steps).toHaveLength(1);
    expect(result.text).toBe('AB');
  });
});

describe('reverse', () => {
  it('reverses the text', () => {
    expect(run('reverse', 'ABC').text).toBe('CBA');
    expect(run('reverse', 'ABCD').text).toBe('DCBA');
    expect(run('reverse', 'A').text).toBe('A');
  });

  it('keeps every character identity while swapping', () => {
    const { steps } = run('reverse', 'ABCDE');
    const initial = cells(steps[0]!).map((c) => c.id).sort();
    for (const step of steps) expect(cells(step).map((c) => c.id).sort()).toEqual(initial);
  });
});

describe('palindrome', () => {
  it.each(['LEVEL', 'ABBA', 'A'])('accepts %s', (text) => {
    const result = run('palindrome', text);
    const last = result.steps.at(-1)!;
    expect(withRole(last, 'found')).toHaveLength(text.length);
    expect(result.text).toBe(text);
  });

  it('points at the first mismatching pair', () => {
    const result = run('palindrome', 'LEVER');
    const last = result.steps.at(-1)!;
    expect(withRole(last, 'swap').map((c) => c.value)).toEqual(['L', 'R']);
    expect(result.text).toBe('LEVER');
  });
});

describe('every operation', () => {
  it.each(stringStructure.ops.map((op) => [op.id, op] as const))('%s explains itself', (_id, op) => {
    const lines = stringStructure.code.split('\n').length;
    const { steps } = op.run(stringStructure.initial, op.arg?.sample ?? '');
    expect(steps.length).toBeGreaterThanOrEqual(2);
    for (const step of steps) {
      expect(step.view.kind).toBe('array');
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });
});

describe('wording for edge cases', () => {
  it('does not claim characters moved when reversing one character', () => {
    expect(run('reverse', 'A').steps.at(-1)!.why).not.toMatch(/crossed|half as many/);
  });

  it('names the real problem when the text to add is invalid', () => {
    expect(run('concat', 'AB', '').steps[0]!.title).toBe('Nothing to add');
    expect(run('concat', 'AB', 'a😀').steps[0]!.title).toBe('Cannot add that text');
  });
});
