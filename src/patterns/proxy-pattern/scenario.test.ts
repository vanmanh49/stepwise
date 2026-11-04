import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { proxyPatternLesson as lesson } from './scenario';

const SAME = 'Same city 3 times';
const DIFFERENT = '3 different cities';

const run = (pattern: boolean, changed: boolean, lookups: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, lookups, t));
};
const facts = (pattern: boolean, changed: boolean, lookups: string) => Object.fromEntries(run(pattern, changed, lookups).result!.facts);

describe('Proxy', () => {
  it('shows the same forecasts with either design', () => {
    for (const changed of [false, true]) {
      for (const lookups of [SAME, DIFFERENT]) {
        const { Today, Week, Map } = facts(false, changed, lookups);
        expect(facts(true, changed, lookups)).toMatchObject({ Today, Week, Map });
      }
    }
    expect(facts(true, false, DIFFERENT)).toMatchObject({ Today: 'Today: 31° sun', Week: 'Week: 14° rain', Map: 'Map: 19° cloud' });
  });

  it('reaches the real API on every lookup without the pattern', () => {
    expect(facts(false, false, SAME)['Real API calls']).toBe('3');
    expect(facts(false, false, DIFFERENT)['Real API calls']).toBe('3');
  });

  it('answers repeat lookups from the cache with the pattern', () => {
    expect(facts(true, false, SAME)['Real API calls']).toBe('1');
    expect(facts(true, false, DIFFERENT)['Real API calls']).toBe('3');
    expect(facts(true, false, SAME)['Time waiting']).toBe('800 ms');
    expect(facts(false, false, SAME)['Time waiting']).toBe('2400 ms');
  });

  it('logs every request after the change, cached ones too', () => {
    for (const pattern of [false, true]) {
      expect(facts(pattern, true, SAME)['Log lines'], String(pattern)).toBe('3');
      expect(facts(pattern, false, SAME)['Log lines']).toBeUndefined();
    }
    expect(facts(true, true, SAME)['Real API calls']).toBe('1');
  });

  it('stops repeat calls at the proxy in the sequence', () => {
    const trace = run(true, false, SAME);
    const into = (id: string) => trace.calls.filter((c) => c.callee === id && c.method === 'forecast').length;
    expect(into('CachedWeather#1')).toBe(3);
    expect(into('WeatherApi#1')).toBe(1);
  });

  it('edits every widget without the pattern, and only the proxy with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['TodayWidget', 'WeekWidget', 'MapWidget']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([15, 3]);
    expect(pattern.classesAdded).toEqual([]);
    expect(pattern.classesEdited).toEqual(['CachedWeather']);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([2, 0]);
  });

  it('marks the pattern cheaper in the cost grid', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: lesson.change, lookups: SAME });
    const grid = steps.at(-2)!.view;
    if (grid.kind !== 'grid') throw new Error('expected the cost grid');
    expect(grid.rows[1]!.cells.map((c) => [c?.value, c?.role])).toEqual([
      ['3 classes', 'default'],
      ['1 class', 'found'],
    ]);
  });
});
