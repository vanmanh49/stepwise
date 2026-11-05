import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { traceRun } from '../trace';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import { statePatternLesson as lesson } from './scenario';

const run = (usePattern: boolean, changed: boolean, actions: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, actions, t));
};
const facts = (usePattern: boolean, changed: boolean, actions: string) => Object.fromEntries(run(usePattern, changed, actions).result!.facts);

describe('State', () => {
  it('moves the document through the same states on both designs', () => {
    for (const usePattern of [false, true]) {
      expect(facts(usePattern, false, 'Submit, approve').History, String(usePattern)).toBe('Draft → In review → Published');
      expect(facts(usePattern, true, 'Submit, approve').History, String(usePattern)).toBe('Draft → In review → Legal review');
      expect(facts(usePattern, false, 'Submit, reject, submit, approve').History).toBe('Draft → In review → Draft → In review → Published');
      expect(facts(usePattern, true, 'Submit, reject, submit, approve').History).toBe('Draft → In review → Draft → In review → Legal review');
    }
  });

  it('refuses an action the state does not allow, with the same message and no move', () => {
    for (const usePattern of [false, true]) {
      for (const changed of [false, true]) {
        const f = facts(usePattern, changed, 'Approve a draft');
        expect(f.History, `${usePattern} ${changed}`).toBe('Draft');
        expect(f.Answers).toBe("approve: Can't approve now: status is Draft");
      }
    }
    for (const m of [naive, naiveChanged, pattern, patternChanged]) {
      const doc = new m.Doc();
      doc.submit();
      doc.approve();
      if (m === naiveChanged || m === patternChanged) doc.approve();
      expect(doc.reject()).toBe("Can't reject now: status is Published");
      expect(doc.submit()).toBe("Can't submit now: status is Published");
      expect(doc.history.at(-1)).toBe('Published');
    }
  });

  it('lets the document hand each action to its current state', () => {
    const calls = run(true, false, 'Submit, approve').calls;
    const approve = calls.find((c) => c.callee === 'Doc#1' && c.method === 'approve')!;
    const next = calls[approve.index + 1]!;
    expect([next.caller, next.callee, next.method]).toEqual(['Doc#1', 'InReview#1', 'approve']);
  });

  it('grows every switch without the pattern, and adds one state class with it', () => {
    const naiveCost = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naiveCost.classesAdded).toEqual([]);
    expect(naiveCost.classesEdited).toEqual(['Doc']);
    expect([naiveCost.branchesBefore, naiveCost.branchesAfter]).toEqual([3, 5]);
    expect([naiveCost.linesAdded, naiveCost.linesRemoved]).toEqual([3, 0]);
    expect(patterned.classesAdded).toEqual(['LegalReview']);
    expect(patterned.classesEdited).toEqual(['InReview']);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([9, 0]);
  });
});
