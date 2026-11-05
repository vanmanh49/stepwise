import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import * as naiveChanged from './naive-changed';
import * as patternChanged from './pattern-changed';
import * as pattern from './pattern';
import { chainOfResponsibilityLesson as lesson } from './scenario';

const run = (usePattern: boolean, changed: boolean, amount: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, amount, t));
};
const approver = (usePattern: boolean, changed: boolean, amount: string) => Object.fromEntries(run(usePattern, changed, amount).result!.facts)['Approved by'];

describe('Chain of Responsibility', () => {
  it('sends each amount to the first level allowed to approve it', () => {
    for (const usePattern of [false, true]) {
      for (const changed of [false, true]) {
        const label = `${usePattern} ${changed}`;
        expect(approver(usePattern, changed, '500'), label).toBe('Team lead');
        expect(approver(usePattern, changed, '3,000'), label).toBe('Manager');
        expect(approver(usePattern, changed, '30,000'), label).toBe('Director');
        expect(approver(usePattern, changed, '150,000'), label).toBe(changed ? 'CFO' : 'Rejected');
      }
    }
  });

  it('treats a limit as allowed, and rejects past the end of the chain without throwing', () => {
    expect(new pattern.ExpenseDesk().approve(500)).toBe('Team lead');
    expect(new pattern.ExpenseDesk().approve(501)).toBe('Manager');
    expect(() => new patternChanged.ExpenseDesk().approve(900_000)).not.toThrow();
    expect(new patternChanged.ExpenseDesk().approve(900_000)).toBe('Rejected');
    expect(new naiveChanged.ExpenseDesk().approve(900_000)).toBe('Rejected');
    expect(new naiveChanged.ExpenseDesk().approve(200_000)).toBe('CFO');
  });

  it('passes 30,000 along three handlers, each one call deeper', () => {
    const handles = run(true, false, '30,000').calls.filter((c) => c.method === 'handle');
    expect(handles.map((c) => c.callee)).toEqual(['TeamLead#1', 'Manager#1', 'Director#1']);
    expect(handles.map((c) => c.depth)).toEqual([1, 2, 3]);
    const titles = patternSteps(lesson, { design: 'Pattern', change: 'None', amount: '30,000' }).map((s) => s.title);
    expect(titles).toContain('TeamLead#1 calls Manager#1.handle(30000)');
  });

  it('grows the if chain without the pattern, and adds a handler plus one wiring line with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['ExpenseDesk']);
    expect(naive.branchesAfter - naive.branchesBefore).toBe(1);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([1, 0]);
    expect(patterned.classesAdded).toEqual(['Cfo']);
    expect(patterned.classesEdited).toEqual(['ExpenseDesk']);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([5, 1]);
  });
});
