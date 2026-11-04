import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import * as pattern from './pattern';
import { observerLesson as lesson } from './scenario';

const STAYS = 'Stays subscribed';
const LEAVES = 'Leaves after the first reading';

const run = (usePattern: boolean, changed: boolean, phone: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, phone, t)).result!;
};
const facts = (usePattern: boolean, changed: boolean, phone: string) => Object.fromEntries(run(usePattern, changed, phone).facts);

describe('Observer', () => {
  it('updates both displays with every reading when the phone stays', () => {
    for (const usePattern of [false, true]) {
      expect(run(usePattern, false, STAYS).ok).toBe(true);
      expect(facts(usePattern, false, STAYS)).toEqual({ Phone: '28°, 31°', Web: '28°, 31°' });
    }
  });

  it('keeps sending readings to a phone that left without the pattern', () => {
    const outcome = run(false, false, LEAVES);
    expect(outcome.ok).toBe(false);
    expect(Object.fromEntries(outcome.facts).Phone).toBe('28°, 31°');
    const last = patternSteps(lesson, { design: 'Naive', change: 'None', phone: LEAVES }).at(-1)!;
    if (last.view.kind !== 'panels') throw new Error('expected panels');
    const result = last.view.panels[1]!.view;
    if (result.kind !== 'grid') throw new Error('expected the result grid');
    expect(result.rows[0]!.cells[0]).toMatchObject({ value: '28°, 31°', role: 'discarded' });
  });

  it('stops updating a phone that unsubscribed with the pattern', () => {
    const outcome = run(true, false, LEAVES);
    expect(outcome.ok).toBe(true);
    expect(Object.fromEntries(outcome.facts)).toEqual({ Phone: '28°', Web: '28°, 31°' });
  });

  it('fires the heat alert once, for 31°, after the change', () => {
    for (const usePattern of [false, true]) expect(facts(usePattern, true, STAYS).Alerts, String(usePattern)).toBe('31°');
    expect(facts(true, false, STAYS).Alerts).toBeUndefined();
  });

  it('survives unsubscribing twice and a reading with nobody subscribed', () => {
    const station = new pattern.Station();
    const phone = new pattern.PhoneDisplay();
    station.subscribe(phone);
    station.unsubscribe(phone);
    expect(() => station.unsubscribe(phone)).not.toThrow();
    expect(() => station.setReading(40)).not.toThrow();
    expect(phone.shown).toEqual([]);
  });

  it('edits the station without the pattern, and adds a subscriber with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['HeatAlert']);
    expect(naive.classesEdited).toEqual(['Station']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([8, 0]);
    expect(patterned.classesAdded).toEqual(['HeatAlert']);
    expect(patterned.classesEdited).toEqual([]);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([6, 0]);
  });
});
