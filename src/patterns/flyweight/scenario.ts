import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const COUNTS = ['6 trees', '12 trees', '24 trees'];
const SPECIES = ['oak', 'pine'];

type Planted = { trees: object[]; plant(x: number, y: number, species: string): void; draw(): string };

/** Every distinct array the trees can reach: their own fields, and their shared type's. */
function arraysHeld(trees: object[]): Set<unknown> {
  const arrays = new Set<unknown>();
  for (const tree of trees) {
    const shared = (tree as { type?: object }).type;
    for (const holder of shared ? [tree, shared] : [tree]) {
      for (const value of Object.values(holder)) if (Array.isArray(value)) arrays.add(value);
    }
  }
  return arrays;
}

export const flyweightLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a bark texture',
  scenario: {
    name: 'trees',
    label: 'Trees',
    options: COUNTS,
    help: 'How many trees to plant. Oaks and pines take turns.',
  },
  run(choice, count, t) {
    let forest: Planted;
    if (choice.pattern) {
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      const factory = new m.TreeFactory();
      t.register(factory);
      forest = new m.Forest(factory);
    } else {
      forest = new (choice.changed ? naiveChanged : naive).Forest();
    }
    t.register(forest);
    const n = Number.parseInt(count, 10);
    for (let i = 0; i < n; i++) forest.plant(i * 3, i % 4, SPECIES[i % 2]!);
    const drawn = forest.draw();
    const arrays = arraysHeld(forest.trees);
    const numbers = [...arrays].reduce((sum: number, a) => sum + (a as number[]).length, 0);
    return {
      ok: true,
      title: `${n} trees ${choice.pattern ? 'share' : 'hold'} ${arrays.size} texture arrays`,
      why: choice.pattern
        ? `Each species' texture was built once and shared, so the count stays at ${arrays.size} however many trees you plant.`
        : `Every tree built its own copy of its species' texture, so the count grows with the forest: ${arrays.size} for ${n} trees.`,
      facts: [
        ['Forest', drawn],
        ['Texture arrays', String(arrays.size)],
        ['Numbers stored', String(numbers)],
      ],
    };
  },
  notes: {
    'Forest.plant': 'The forest plants a tree at a position. The position belongs to this tree alone.',
    'TreeFactory.get': 'The factory hands out one shared type per species, and builds it only the first time that species is asked for.',
    'Forest.draw': 'The forest draws every tree it holds.',
  },
};
