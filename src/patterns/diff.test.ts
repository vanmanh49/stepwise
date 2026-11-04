import { describe, expect, it } from 'vitest';
import { changeCost, countBranches } from './diff';

const A = `export class A {
  run() {
    return 1;
  }
}`;

const B = `export class B {
  go() {
    return 2;
  }
}`;

describe('changeCost', () => {
  it('finds nothing in identical sources', () => {
    expect(changeCost(A, A)).toEqual({
      classesAdded: [],
      classesRemoved: [],
      classesEdited: [],
      linesAdded: 0,
      linesRemoved: 0,
      branchesBefore: 0,
      branchesAfter: 0,
      lines: [],
    });
  });

  it('counts an appended class as added, not edited', () => {
    const cost = changeCost(A, `${A}\n\n${B}`);
    expect(cost.classesAdded).toEqual(['B']);
    expect(cost.classesEdited).toEqual([]);
    expect(cost.linesAdded).toBe(5);
    expect(cost.linesRemoved).toBe(0);
    expect(cost.lines.every((l) => l.sign === '+' && l.className === 'B')).toBe(true);
  });

  it('counts one changed line inside a class as an edit', () => {
    const cost = changeCost(A, A.replace('return 1;', 'return 3;'));
    expect(cost.classesEdited).toEqual(['A']);
    expect(cost.linesAdded).toBe(1);
    expect(cost.linesRemoved).toBe(1);
    expect(cost.lines).toEqual([
      { sign: '-', text: 'return 1;', className: 'A' },
      { sign: '+', text: 'return 3;', className: 'A' },
    ]);
  });

  it('counts a deleted class as removed', () => {
    const cost = changeCost(`${A}\n${B}`, A);
    expect(cost.classesRemoved).toEqual(['B']);
    expect(cost.classesEdited).toEqual([]);
    expect(cost.linesRemoved).toBe(5);
  });

  it('ignores blank lines and comments', () => {
    const cost = changeCost(A, A.replace('  run() {', '\n  // runs once\n  run() {\n'));
    expect(cost.linesAdded + cost.linesRemoved).toBe(0);
    expect(cost.classesEdited).toEqual([]);
  });

  it('counts branches before and after', () => {
    const cost = changeCost(A, A.replace('return 1;', 'if (x) return 1;'));
    expect(cost.branchesBefore).toBe(0);
    expect(cost.branchesAfter).toBe(1);
  });

  it('gives the same answer every run', () => {
    expect(changeCost(A, `${B}\n${A}`)).toEqual(changeCost(A, `${B}\n${A}`));
  });
});

describe('countBranches', () => {
  it('counts if, case and ternary lines, not optional fields', () => {
    expect(countBranches('if (a) {\n}\ncase 1:\nx = a ? b : c\ny?: string')).toBe(3);
  });
});
