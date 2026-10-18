import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { failureTable, kmpCode, kmpSearch, kmpSteps } from './kmp';
import { rabinKarpCode, rabinKarpSearch, rabinKarpSteps } from './rabinKarp';

function expectExplained(steps: Step[], code: string) {
  const lines = code.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

function indexOfAll(text: string, pattern: string): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(pattern); at !== -1; at = text.indexOf(pattern, at + 1)) found.push(at);
  return found;
}

function seededText(length: number, seed: number): string {
  return Array.from({ length }, () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return 'AB'[seed % 2];
  }).join('');
}

const seededPairs = Array.from({ length: 50 }, (_, k) => [seededText(1 + (k % 20), k + 1), seededText(1 + (k % 4), k + 500)] as const);

const KMP_TEXT = 'ABABDABACDABABCABAB';

describe('KMP', () => {
  it('builds the failure table', () => {
    expect(failureTable('ABABCABAB')).toEqual([0, 0, 1, 2, 0, 1, 2, 3, 4]);
    expect(failureTable('AAAA')).toEqual([0, 1, 2, 3]);
  });

  it('finds the lesson example', () => {
    expect(kmpSearch(KMP_TEXT, 'ABABCABAB')).toEqual([10]);
  });

  it('finds overlapping matches', () => {
    expect(kmpSearch('AAAA', 'AA')).toEqual([0, 1, 2]);
  });

  it.each(seededPairs)('matches indexOf on %s / %s', (text, pattern) => {
    expect(kmpSearch(text, pattern)).toEqual(indexOfAll(text, pattern));
  });

  it('returns nothing when the pattern is longer than the text', () => {
    expect(kmpSearch('AB', 'ABC')).toEqual([]);
    const steps = kmpSteps({ text: 'AB', pattern: 'ABC' });
    expectExplained(steps, kmpCode);
    expect(steps.some((s) => s.title.includes('longer'))).toBe(true);
  });

  it('builds the table first, then scans without moving back in the text', () => {
    const steps = kmpSteps({ text: KMP_TEXT, pattern: 'ABABCABAB' });
    expectExplained(steps, kmpCode);
    expect(steps[1]!.view.kind).toBe('grid');
    const scan = steps.filter((s) => s.view.kind === 'panels' && typeof s.variables?.i === 'number');
    expect(scan.length).toBeGreaterThan(0);
    const positions = scan.map((s) => s.variables!.i as number);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    expect(steps[steps.length - 1]!.title).toContain('10');
  });

  it('places the pattern under the text at the current shift', () => {
    const steps = kmpSteps({ text: 'XXAB', pattern: 'AB' });
    const last = steps[steps.length - 1]!.view;
    if (last.kind !== 'panels' || last.panels[0]!.view.kind !== 'grid') throw new Error('expected a match grid');
    const patternRow = last.panels[0]!.view.rows[1]!.cells.map((c) => c?.value ?? null);
    expect(patternRow).toEqual([null, null, 'A', 'B']);
  });

  it('stays readable for the largest input', () => {
    expectExplained(kmpSteps({ text: 'ABABABABABABABABABAB', pattern: 'ABABABABAB' }), kmpCode);
  });

  it.each([{ text: '', pattern: 'A' }, { text: 'ABC', pattern: '' }, { text: 'A'.repeat(21), pattern: 'A' }, { text: 'ABC', pattern: 'A'.repeat(11) }])(
    'refuses %o with one step',
    (values) => {
      expect(kmpSteps(values)).toHaveLength(1);
    },
  );
});

describe('Rabin-Karp', () => {
  it('finds the lesson example', () => {
    expect(rabinKarpSearch('GEEKS FOR GEEKS', 'GEEK').matches).toEqual([0, 10]);
  });

  it('finds overlapping matches', () => {
    expect(rabinKarpSearch('AAAA', 'AA').matches).toEqual([0, 1, 2]);
  });

  it.each(seededPairs)('matches indexOf on %s / %s', (text, pattern) => {
    expect(rabinKarpSearch(text, pattern).matches).toEqual(indexOfAll(text, pattern));
  });

  it('checks the characters when hashes collide', () => {
    // "JU" and "AB" share hash 41 with base 256 and modulus 101.
    expect(rabinKarpSearch('JUMP AB', 'AB')).toEqual({ matches: [5], spuriousHits: [0] });
    const steps = rabinKarpSteps({ text: 'JUMP AB', pattern: 'AB' });
    expectExplained(steps, rabinKarpCode);
    expect(steps.some((s) => s.title === 'Hashes match, characters differ')).toBe(true);
  });

  it('shows both hashes at every window', () => {
    const steps = rabinKarpSteps({ text: 'GEEKS FOR GEEKS', pattern: 'GEEK' });
    expectExplained(steps, rabinKarpCode);
    const windows = steps.filter((s) => s.variables?.['window hash'] !== undefined);
    expect(windows.length).toBeGreaterThanOrEqual(12);
    expect(windows.every((s) => s.variables!['pattern hash'] !== undefined)).toBe(true);
    expect(steps[steps.length - 1]!.title).toContain('0, 10');
  });

  it('says when the pattern is longer than the text', () => {
    const steps = rabinKarpSteps({ text: 'AB', pattern: 'ABC' });
    expectExplained(steps, rabinKarpCode);
    expect(steps.some((s) => s.title.includes('longer'))).toBe(true);
  });

  it('stays readable for the largest input', () => {
    expectExplained(rabinKarpSteps({ text: 'ABABABABABABABABABAB', pattern: 'ABABABABAB' }), rabinKarpCode);
  });

  it.each([{ text: '', pattern: 'A' }, { text: 'A'.repeat(21), pattern: 'A' }, { text: 'ABC', pattern: 'A'.repeat(11) }])('refuses %o with one step', (values) => {
    expect(rabinKarpSteps(values)).toHaveLength(1);
  });
});
