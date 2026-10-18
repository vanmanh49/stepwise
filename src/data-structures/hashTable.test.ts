import { describe, expect, it } from 'vitest';
import type { BucketsView, Step } from '../types/visualization';
import { hashOf, hashTableStructure, LOAD_LIMIT, MAX_KEYS, type HashState } from './hashTable';
import { int, pick, rng } from './random.testutil';

function run(opId: string, state: HashState, words: string[], args: number[] = []) {
  const op = hashTableStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, args, words);
}

const entries = (state: HashState) => state.buckets.flat();
const size = (state: HashState) => entries(state).length;
const lastBuckets = (steps: Step[]) => steps.at(-1)!.view as BucketsView;

describe('hashOf', () => {
  it('mixes in one character at a time, taking the remainder each time', () => {
    // oxlint-disable-next-line oxc/erasing-op -- starts from 0, written out to mirror the hash formula
    const manual = (((((0 * 31 + 99) % 8) * 31 + 97) % 8) * 31 + 116) % 8;
    expect(hashOf('cat', 8)).toBe(manual);
    expect(hashOf('cat', 8)).toBe(6);
  });
});

describe('hash table', () => {
  const initial = hashTableStructure.initial;

  it('starts with 8 buckets and a collision', () => {
    expect(initial.buckets).toHaveLength(8);
    expect(initial.buckets.some((b) => b.length >= 2)).toBe(true);
    for (const [i, bucket] of initial.buckets.entries()) for (const [key] of bucket) expect(hashOf(key, 8)).toBe(i);
  });

  it('hashes the key one character per step, then appends a new key to the end of its chain', () => {
    const { steps, state } = run('put', initial, ['elk'], [9]);
    expect(steps.filter((s) => /^".": h/.test(s.title))).toHaveLength(3);
    expect(state.buckets[4]!.map(([k]) => k)).toEqual(['dog', 'owl', 'elk']);
    expect(size(state)).toBe(size(initial) + 1);
  });

  it('updates an existing key in place', () => {
    const { state } = run('put', initial, ['owl'], [42]);
    expect(size(state)).toBe(size(initial));
    expect(state.buckets[4]).toEqual([['dog', 5], ['owl', 42]]);
  });

  it('walks the chain with one comparison per entry when getting', () => {
    const { steps, state } = run('get', initial, ['owl']);
    expect(steps.filter((s) => s.title.startsWith('Compare'))).toHaveLength(2);
    expect(JSON.stringify(steps.at(-1)!.view)).toContain('"role":"found"');
    expect(steps.at(-1)!.variables?.value).toBe(2);
    expect(state).toBe(initial);
    expect(run('get', initial, ['zebra']).steps.at(-1)!.title).toContain('not in the table');
  });

  it('removes a key', () => {
    const { state } = run('remove', initial, ['dog']);
    expect(state.buckets[4]).toEqual([['owl', 2]]);
    expect(run('remove', initial, ['zebra']).state).toBe(initial);
  });

  it('doubles to 16 buckets and rehashes every key when the 7th key arrives', () => {
    const six = run('put', initial, ['emu'], [4]).state;
    expect(six.buckets).toHaveLength(8);
    const { steps, state } = run('put', six, ['yak'], [1]);
    expect(state.buckets).toHaveLength(16);
    for (const [i, bucket] of state.buckets.entries()) for (const [key] of bucket) expect(hashOf(key, 16)).toBe(i);
    expect(steps.filter((s) => s.title.startsWith('Move'))).toHaveLength(7);
    expect(lastBuckets(steps).buckets).toHaveLength(16);
  });

  it('refuses a 13th key but still updates an existing one at the limit', () => {
    let state = initial;
    for (const key of ['ant', 'yak', 'elk', 'cow', 'pig', 'hen', 'bat']) state = run('put', state, [key], [1]).state;
    expect(size(state)).toBe(MAX_KEYS);
    const refused = run('put', state, ['rat'], [1]);
    expect(refused.steps).toHaveLength(1);
    expect(refused.state).toBe(state);
    const updated = run('put', state, ['cat'], [99]).state;
    expect(entries(updated)).toContainEqual(['cat', 99]);
  });

  it('matches a Map over random operations and keeps the load factor at or below 0.75', () => {
    const r = rng(7);
    const keys = ['cat', 'dog', 'owl', 'bee', 'fox', 'emu', 'ant', 'yak', 'elk', 'cow', 'pig', 'hen', 'bat', 'rat', 'kiwi'];
    let state = initial;
    const reference = new Map(entries(initial));
    for (let i = 0; i < 200; i++) {
      const key = pick(r, keys);
      const op = pick(r, ['put', 'put', 'get', 'remove']);
      const value = int(r, 0, 99);
      state = run(op, state, [key], [value]).state;
      if (op === 'put' && (reference.has(key) || reference.size < MAX_KEYS)) reference.set(key, value);
      if (op === 'remove') reference.delete(key);
      expect(new Map(entries(state))).toEqual(reference);
      expect(size(state) / state.buckets.length).toBeLessThanOrEqual(LOAD_LIMIT);
    }
  });
});
