import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const COPIES = ['Deep', 'Shallow'];
const SHIELD = 50;

type Enemy = { name: string; hp: number; speed: number; loot: string[]; shield?: number; pickUp(item: string): void };
type Module = { Enemy: new (name: string, hp: number, speed: number, loot: string[], shield?: number) => Enemy; Spawner: new () => { spawnLike(template: never, deep: boolean): Enemy } };

export const prototypeLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a shield field',
  scenario: { name: 'copy', label: 'Copy', options: COPIES, help: 'Whether the copy gets its own loot list or shares the template\'s.' },
  run(choice, copyKind, t) {
    const m: Module = choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive;
    const template = choice.changed ? new m.Enemy('orc', 30, 2, ['axe'], SHIELD) : new m.Enemy('orc', 30, 2, ['axe']);
    const spawner = new m.Spawner();
    t.register(template);
    t.register(spawner);
    const copy = spawner.spawnLike(template as never, copyKind === 'Deep');
    copy.pickUp('gem');
    const shieldLost = choice.changed && copy.shield !== template.shield;
    const lootShared = template.loot.includes('gem');
    const stats = `${copy.name}, hp ${copy.hp}, speed ${copy.speed}`;
    return {
      ok: !shieldLost && !lootShared,
      title: shieldLost ? 'The copy lost its shield' : lootShared ? 'The template picked up the copy\'s gem' : 'The copy matches the template, with its own loot',
      why: shieldLost
        ? 'The spawner copies each field by name, and nobody added shield to it. Adding a field to Enemy never touched the spawner, so nothing reminded anyone.'
        : lootShared
          ? 'A shallow copy copies the reference to the loot list, not the list. Both enemies now hold the same array, so one pickup changes both.'
          : choice.pattern
            ? 'clone copies every field the enemy has, whatever they are, and gives the copy its own loot list.'
            : 'The spawner copied every field it knows about, and made a new loot list.',
      facts: [
        ['Copy', choice.changed ? `${stats}, shield ${copy.shield}${shieldLost ? ` (template has ${template.shield})` : ''}` : stats],
        ['Copy loot', copy.loot.join(', ')],
        ['Template loot', template.loot.join(', ')],
      ],
    };
  },
  notes: {
    'Spawner.spawnLike': 'The spawner makes a new enemy that looks like the template.',
    'Enemy.clone': 'clone lives inside Enemy, next to its fields. Object.assign copies every field the enemy has, so a new field is copied too.',
    'Enemy.pickUp': 'The new enemy picks up a gem. Only its own loot should change.',
  },
};
