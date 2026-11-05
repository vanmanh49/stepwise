import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternPresets } from '../steps';
import { traceRun } from '../trace';
import * as patternChanged from './pattern-changed';
import { mementoLesson as lesson } from './scenario';

const WIN = 'Win the fight';
const LOAD = 'Lose and load the save';
const TWICE = 'Lose twice, loading the same save each time';

const run = (usePattern: boolean, changed: boolean, then: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, then, t));
};
const facts = (usePattern: boolean, changed: boolean, then: string) => Object.fromEntries(run(usePattern, changed, then).result!.facts);

describe('Memento', () => {
  it('keeps the win, and loads the save after a loss, on every design', () => {
    for (const usePattern of [false, true]) {
      expect(facts(usePattern, false, WIN), String(usePattern)).toEqual({ Saved: 'hp 100, gold 50, x 3', Now: 'hp 100, gold 80, x 9' });
      expect(facts(usePattern, false, LOAD), String(usePattern)).toEqual({
        Saved: 'hp 100, gold 50, x 3',
        'After the fight': 'hp 0, gold 20, x 9',
        'After loading': 'hp 100, gold 50, x 3',
      });
      expect(facts(usePattern, true, LOAD), String(usePattern)).toEqual({
        Saved: 'hp 100, gold 50, x 3, items: none',
        'After the fight': 'hp 0, gold 20, x 9, items: potion',
        'After loading': 'hp 100, gold 50, x 3, items: none',
      });
    }
  });

  it('gives the same hero after loading the same save twice', () => {
    for (const usePattern of [false, true]) {
      for (const changed of [false, true]) {
        const outcome = run(usePattern, changed, TWICE).result!;
        const f = Object.fromEntries(outcome.facts);
        expect(outcome.ok, `${usePattern} ${changed}`).toBe(true);
        expect(f['After loading again']).toBe(f.Saved);
        expect(f['After loading']).toBe(f.Saved);
      }
    }
  });

  it('never lets the hero share the memento\'s inventory', () => {
    const hero = new patternChanged.Hero();
    const memento = hero.save();
    hero.fight(false);
    hero.restore(memento);
    hero.fight(false);
    hero.restore(memento);
    expect(hero.status()).toBe('hp 100, gold 50, x 3, items: none');
  });

  it('has the hero make its own memento', () => {
    const trace = run(true, false, LOAD);
    const memento = trace.objects.find((o) => o.id === 'HeroMemento#1')!;
    expect(memento.origin.kind).toBe('made');
    const by = memento.origin.kind === 'made' ? trace.calls[memento.origin.by]! : undefined;
    expect([by?.callee, by?.method]).toEqual(['Hero#1', 'save']);
  });

  it('edits the hero and the save slot without the pattern, and only the hero with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['Hero', 'SaveSlot']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([6, 3]);
    expect(patterned.classesAdded).toEqual([]);
    expect(patterned.classesEdited).toEqual(['Hero']);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([3, 1]);
  });

  it('opens on an option that shows the pattern at work', () => {
    for (const preset of patternPresets(lesson)) expect(preset.values['outcome'], preset.label).toBe('Lose and load the save');
  });
});
