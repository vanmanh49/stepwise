import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { MAX_STEPS, patternPresets, patternSteps } from '../steps';
import { traceRun } from '../trace';
import * as patternChanged from './pattern-changed';
import { iteratorLesson as lesson } from './scenario';

const PLAYLISTS = ['Empty', '4 songs', '7 songs'];

const run = (usePattern: boolean, changed: boolean, playlist: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, playlist, t));
};
const facts = (usePattern: boolean, changed: boolean, playlist: string) => Object.fromEntries(run(usePattern, changed, playlist).result!.facts);

describe('Iterator', () => {
  it('gives the same answers on every design, empty playlist and page edges included', () => {
    expect(facts(false, false, 'Empty')).toEqual({ 'Total time': '0:00', 'Find "Blue"': 'not found', Printed: 'nothing' });
    expect(facts(false, false, '4 songs')).toEqual({ 'Total time': '13:50', 'Find "Blue"': 'Blue', Printed: '1. Red, 2. Gold, 3. Blue, 4. Jade' });
    expect(facts(false, false, '7 songs')).toEqual({
      'Total time': '23:40',
      'Find "Blue"': 'Blue',
      Printed: '1. Red, 2. Gold, 3. Blue, 4. Jade, 5. Rose, 6. Gray, 7. Teal',
    });
    for (const playlist of PLAYLISTS) {
      const expected = facts(false, false, playlist);
      for (const [usePattern, changed] of [[false, true], [true, false], [true, true]] as const) {
        expect(facts(usePattern, changed, playlist), `${playlist} ${usePattern} ${changed}`).toEqual(expected);
      }
    }
  });

  it('reports hasNext correctly at every page edge after the change', () => {
    const list = new patternChanged.Playlist();
    expect(list.iterator().hasNext()).toBe(false);
    for (const [i, title] of ['a', 'b', 'c', 'd'].entries()) list.add(new patternChanged.Song(title, i));
    const walk = list.iterator();
    const seen: string[] = [];
    while (walk.hasNext()) seen.push(walk.next().title);
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(list.pages.map((p) => p.length)).toEqual([3, 1]);
  });

  it('stops the search at the song it finds', () => {
    const calls = run(true, false, '7 songs').calls;
    const find = calls.findIndex((c) => c.method === 'find');
    const found = calls.findIndex((c, i) => i > find && c.method === 'next' && c.returned === 'Song#3');
    expect(found).toBeGreaterThan(find);
    const lines = calls.findIndex((c) => c.method === 'lines');
    expect(calls.slice(found + 1, lines).filter((c) => c.method === 'next')).toEqual([]);
  });

  it('runs the largest case whole, within the step cap', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: 'Store songs in pages of 3', playlist: '7 songs' });
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS + 1);
    expect(steps.some((s) => s.title.includes('skipped') || s.title.includes('was cut'))).toBe(false);
    expect(steps.at(-3)!.variables?.result).toBe('right');
  });

  it('edits every client without the pattern, and only the playlist and its iterator with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['Playlist', 'Duration', 'Search', 'Printer']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([15, 6]);
    expect(patterned.classesAdded).toEqual([]);
    expect(patterned.classesEdited).toEqual(['Playlist', 'PlaylistIterator']);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([10, 4]);
  });

  it('opens on an option that shows the pattern at work', () => {
    for (const preset of patternPresets(lesson)) expect(preset.values['playlist'], preset.label).toBe('4 songs');
  });
});
