import { describe, expect, it } from 'vitest';
import { allLessons } from '../lessons/all.testutil';
import type { StructureDef, StructureOp } from '../types/lesson';
import { deepFreeze, int, pick, rng } from './random.testutil';

const WORDS = ['cat', 'car', 'cart', 'dog', 'do', 'a', 'owl', 'bee', 'zebra'];

function inputs(op: StructureOp<unknown>, r: () => number) {
  const args: number[] = [];
  const words: string[] = [];
  for (const arg of op.args) {
    if ('text' in arg) words.push(pick(r, [arg.sample, ...WORDS]));
    else args.push(pick(r, [arg.sample, int(r, 0, 9), int(r, -5, 99)]));
  }
  return { args, words };
}

const structures = allLessons.flatMap((l) => (l.visualization.kind === 'structure' ? [[l.id, l.visualization.structure, l.code] as const] : []));

describe.each(structures)('structure %s', (_id, def: StructureDef<unknown>, code) => {
  const lines = code.split('\n').length;

  it.each([1, 2, 3])('keeps its contract over random operations (seed %i)', (seed) => {
    const r = rng(seed);
    let state = def.initial;
    for (let i = 0; i < 50; i++) {
      const op = pick(r, def.ops);
      const { args, words } = inputs(op, r);
      const label = `${op.id}(${[...args, ...words].join(', ')}) after ${i} ops`;
      const result = op.run(deepFreeze(state), args, words);
      expect(result.steps.length, label).toBeGreaterThanOrEqual(1);
      for (const step of result.steps) {
        expect(step.codeLine, label).toBeGreaterThanOrEqual(1);
        expect(step.codeLine, label).toBeLessThanOrEqual(lines);
      }
      state = result.state;
    }
  });
});
