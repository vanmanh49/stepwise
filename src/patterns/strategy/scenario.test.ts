import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import * as naiveChanged from './naive-changed';
import * as patternChanged from './pattern-changed';
import { PRICES, RULES, strategyLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, rule: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, rule, t));
};
const facts = (pattern: boolean, changed: boolean, rule: string) => Object.fromEntries(run(pattern, changed, rule).result!.facts);

const TOTALS: Record<string, number> = { regular: 19149, member: 17234, sale: 16709, bulk: 16277 };

describe('Strategy', () => {
  it('prices the cart in exact cents for every rule, the same in both designs', () => {
    const naiveCart = new naiveChanged.Cart(PRICES);
    const rules = { regular: patternChanged.RegularPrice, member: patternChanged.MemberPrice, sale: patternChanged.SalePrice, bulk: patternChanged.BulkPrice };
    for (const [name, Rule] of Object.entries(rules)) {
      naiveCart.setRule(name);
      const cents = new Rule().apply(PRICES);
      expect(Number.isInteger(cents), name).toBe(true);
      expect(cents, name).toBe(TOTALS[name]);
      expect(naiveCart.total(), name).toBe(cents);
    }
  });

  it('shows the price before and after the swap', () => {
    for (const rule of RULES) {
      const changed = rule.startsWith('Bulk');
      expect(facts(true, changed, rule), rule).toEqual(facts(false, changed, rule));
    }
    expect(facts(true, false, 'Member')).toEqual({ 'Regular price': '$191.49', 'Member price': '$172.34', 'You save': '$19.15' });
    expect(facts(true, true, 'Bulk (10+ items)')['Bulk (10+ items) price']).toBe('$162.77');
  });

  it('swaps the rule between the two totals', () => {
    const trace = run(true, false, 'Sale');
    expect(trace.calls.filter((c) => c.depth === 0).map((c) => c.method)).toEqual(['total', 'setRule', 'total']);
    expect(trace.calls.filter((c) => c.method === 'apply').map((c) => c.callee)).toEqual(['RegularPrice#1', 'SalePrice#1']);
  });

  it('refuses the bulk rule before the change', () => {
    expect(patternSteps(lesson, { design: 'Naive', change: 'None', rule: 'Bulk (10+ items)' })).toHaveLength(1);
  });

  it('grows the cart\'s if chain without the pattern, and puts the new branch in its own class with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['Cart']);
    expect(naive.branchesAfter - naive.branchesBefore).toBe(1);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([1, 0]);
    expect(pattern.classesAdded).toEqual(['BulkPrice']);
    expect(pattern.classesEdited).toEqual([]);
    expect(pattern.branchesAfter - pattern.branchesBefore).toBe(1);
    expect(pattern.lines.every((l) => l.className === 'BulkPrice')).toBe(true);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([6, 0]);
  });
});
