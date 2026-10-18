import type { StructureDef } from '../types/lesson';
import type { BucketsView, Cell, Role, Step } from '../types/visualization';

export const MAX_KEYS = 12;
export const LOAD_LIMIT = 0.75;

/** Separate chaining: each bucket is a chain of [key, value] entries, oldest first. */
export interface HashState {
  buckets: [string, number][][];
}

const code = `class HashTable {
  buckets: [string, number][][] = Array.from({ length: 8 }, () => []);
  size = 0;

  hash(key: string): number {
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % this.buckets.length;
    return h;
  }

  put(key: string, value: number): void {
    const chain = this.buckets[this.hash(key)];
    for (const entry of chain) {
      if (entry[0] === key) { entry[1] = value; return; }
    }
    chain.push([key, value]);
    this.size++;
    if (this.size / this.buckets.length > 0.75) this.resize();
  }

  get(key: string): number | undefined {
    for (const [k, v] of this.buckets[this.hash(key)]) {
      if (k === key) return v;
    }
    return undefined;
  }

  remove(key: string): boolean {
    const chain = this.buckets[this.hash(key)];
    const i = chain.findIndex(([k]) => k === key);
    if (i === -1) return false;
    chain.splice(i, 1);
    this.size--;
    return true;
  }

  private resize(): void {
    const old = this.buckets.flat();
    this.buckets = Array.from({ length: this.buckets.length * 2 }, () => []);
    for (const [k, v] of old) this.buckets[this.hash(k)].push([k, v]);
  }
}`;

const LINE = { hashChar: 7, putBucket: 12, putCompare: 14, append: 16, grow: 18, getCompare: 23, getMiss: 25, removeBucket: 29, removeFind: 30, removeMiss: 31, splice: 32, rehash: 40 };

export function hashOf(key: string, capacity: number): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % capacity;
  return h;
}

const size = (state: HashState) => state.buckets.reduce((n, b) => n + b.length, 0);
const loadText = (keys: number, capacity: number) => `${keys}/${capacity} = ${(keys / capacity).toFixed(2)}`;
const cell = (key: string, value: number, role: Role = 'default'): Cell => ({ id: `k:${key}`, value: `${key}: ${value}`, role });

function view(state: HashState, roles: Record<string, Role> = {}, input?: BucketsView['input']): BucketsView {
  return {
    kind: 'buckets',
    direction: 'down',
    ...(input && { input }),
    buckets: state.buckets.map((chain, i) => ({ label: String(i), cells: chain.map(([k, v]) => cell(k, v, roles[k])) })),
  };
}

/** One step per character of the key, ending with its bucket. */
function hashSteps(state: HashState, key: string, line: number): Step[] {
  const capacity = state.buckets.length;
  const steps: Step[] = [];
  let h = 0;
  [...key].forEach((ch, i) => {
    const before = h;
    h = (h * 31 + ch.charCodeAt(0)) % capacity;
    steps.push({
      title: `"${ch}": h = (${before} × 31 + ${ch.charCodeAt(0)}) mod ${capacity} = ${h}`,
      why:
        i === 0
          ? `A hash function turns the key into a bucket number. It mixes in one character at a time: multiply what it has so far by 31, add the character's code, and keep the remainder after dividing by the ${capacity} buckets.`
          : 'Each character changes the number, so keys that differ in any letter usually land in different buckets.',
      codeLine: LINE.hashChar,
      variables: { key, ch, code: ch.charCodeAt(0), h },
      view: view(state, {}, {
        label: 'Hashing the key',
        cells: [...key].map((c, k) => ({ id: `c:${k}`, value: c, role: k === i ? 'active' : k < i ? 'visited' : 'default' })),
      }),
    });
  });
  const chain = state.buckets[h]!;
  steps.push({
    title: `"${key}" belongs in bucket ${h}`,
    why:
      chain.length === 0
        ? `Bucket ${h} is empty, so there is nothing to compare with.`
        : `Bucket ${h} already holds ${chain.length} ${chain.length === 1 ? 'entry' : 'entries'}. Different keys can share a bucket (a collision), so the chain has to be checked key by key.`,
    codeLine: line,
    variables: { key, bucket: h },
    view: view(state),
  });
  return steps;
}

/** Compares the key with each entry of its chain until it matches; returns the match's index or -1. */
function walkChain(state: HashState, key: string, line: number, steps: Step[]): number {
  const chain = state.buckets[hashOf(key, state.buckets.length)]!;
  for (const [i, [k]] of chain.entries()) {
    const match = k === key;
    steps.push({
      title: `Compare "${key}" with "${k}"`,
      why: match ? 'The keys are equal: this is the entry.' : 'Different keys in the same bucket. Move along the chain.',
      codeLine: line,
      variables: { key, entry: k },
      view: view(state, { ...Object.fromEntries(chain.slice(0, i).map(([p]) => [p, 'visited' as Role])), [k]: match ? 'found' : 'compare' }),
    });
    if (match) return i;
  }
  return -1;
}

function withChain(state: HashState, bucket: number, chain: [string, number][]): HashState {
  return { buckets: state.buckets.map((b, i) => (i === bucket ? chain : b)) };
}

/** Doubles the buckets and moves every key, one step per key. */
function resizeSteps(state: HashState, steps: Step[]): HashState {
  const old = state.buckets.flat();
  const capacity = state.buckets.length * 2;
  let next: HashState = { buckets: Array.from({ length: capacity }, () => []) };
  const waiting = (from: number) => ({ label: 'waiting to be rehashed', cells: old.slice(from).map(([k, v]) => cell(k, v)) });
  steps.push({
    title: `Load factor ${loadText(old.length, state.buckets.length)} is over ${LOAD_LIMIT}: resize to ${capacity} buckets`,
    why: 'The load factor is keys per bucket. As it grows, chains get longer and every operation slows down. Doubling the buckets keeps chains short, at the cost of one O(n) rehash now.',
    codeLine: LINE.grow,
    variables: { keys: old.length, buckets: capacity },
    view: { ...view(next), input: waiting(0) },
  });
  old.forEach(([k, v], i) => {
    const bucket = hashOf(k, capacity);
    next = withChain(next, bucket, [...next.buckets[bucket]!, [k, v]]);
    steps.push({
      title: `Move "${k}" to bucket ${bucket}`,
      why: `The bucket depends on the number of buckets, so every key must be hashed again: hash("${k}") mod ${capacity} = ${bucket}.`,
      codeLine: LINE.rehash,
      variables: { key: k, bucket },
      view: { ...view(next, { [k]: 'found' }), input: waiting(i + 1) },
    });
  });
  return next;
}

export const hashTableStructure: StructureDef<HashState> = {
  initial: {
    buckets: [[], [], [['bee', 7]], [], [['dog', 5], ['owl', 2]], [], [['cat', 3]], [['fox', 1]]],
  },
  view: (state) => view(state),
  code,
  ops: [
    {
      id: 'put',
      label: 'Put',
      args: [
        { name: 'key', label: 'Key', sample: 'emu', text: true },
        { name: 'value', label: 'Value', sample: 4 },
      ],
      run(state, [value = 0], [key = '']) {
        const bucket = hashOf(key, state.buckets.length);
        const exists = state.buckets[bucket]!.some(([k]) => k === key);
        if (!exists && size(state) >= MAX_KEYS) {
          return {
            steps: [{ title: 'The table is full', why: `This visualization holds at most ${MAX_KEYS} keys so every bucket stays readable. Remove a key first, or update one that is already there.`, codeLine: LINE.append, view: view(state) }],
            state,
          };
        }
        const steps = hashSteps(state, key, LINE.putBucket);
        const at = walkChain(state, key, LINE.putCompare, steps);
        if (at >= 0) {
          const next = withChain(state, bucket, state.buckets[bucket]!.map(([k, v]) => [k, k === key ? value : v]));
          steps.push({
            title: `Update "${key}" to ${value}`,
            why: 'A key appears at most once, so putting an existing key replaces its value. The number of keys does not change.',
            codeLine: LINE.putCompare,
            variables: { key, value },
            view: view(next, { [key]: 'found' }),
          });
          return { steps, state: next };
        }
        let next = withChain(state, bucket, [...state.buckets[bucket]!, [key, value]]);
        const keys = size(next);
        steps.push({
          title: `Append "${key}: ${value}" to bucket ${bucket}`,
          why: `The key is new, so it goes at the end of the chain. Load factor is now ${loadText(keys, next.buckets.length)}.`,
          codeLine: LINE.append,
          variables: { key, value, load: Number((keys / next.buckets.length).toFixed(2)) },
          view: view(next, { [key]: 'found' }),
        });
        if (keys / next.buckets.length > LOAD_LIMIT) next = resizeSteps(next, steps);
        return { steps, state: next };
      },
    },
    {
      id: 'get',
      label: 'Get',
      args: [{ name: 'key', label: 'Key', sample: 'owl', text: true }],
      run(state, _args, [key = '']) {
        const steps = hashSteps(state, key, LINE.getCompare);
        const at = walkChain(state, key, LINE.getCompare, steps);
        if (at >= 0) {
          const value = state.buckets[hashOf(key, state.buckets.length)]![at]![1];
          steps.push({
            title: `Found "${key}": ${value}`,
            why: `Only one bucket's chain had to be searched, not the whole table. With short chains that is O(1) on average.`,
            codeLine: LINE.getCompare,
            variables: { key, value },
            view: view(state, { [key]: 'found' }),
          });
        } else {
          steps.push({
            title: `"${key}" is not in the table`,
            why: 'If the key were stored, it would be in this bucket. The whole chain was checked, so it is not there.',
            codeLine: LINE.getMiss,
            variables: { key },
            view: view(state),
          });
        }
        return { steps, state };
      },
    },
    {
      id: 'remove',
      label: 'Remove',
      args: [{ name: 'key', label: 'Key', sample: 'dog', text: true }],
      run(state, _args, [key = '']) {
        const steps = hashSteps(state, key, LINE.removeBucket);
        const at = walkChain(state, key, LINE.removeFind, steps);
        if (at < 0) {
          steps.push({ title: `"${key}" is not in the table`, why: 'The chain was checked to the end without a match, so there is nothing to remove.', codeLine: LINE.removeMiss, variables: { key }, view: view(state) });
          return { steps, state };
        }
        const bucket = hashOf(key, state.buckets.length);
        const next = withChain(state, bucket, state.buckets[bucket]!.filter(([k]) => k !== key));
        steps.push({
          title: `Remove "${key}" from bucket ${bucket}`,
          why: 'The entry is cut out of its chain. The other entries in the bucket stay where they are.',
          codeLine: LINE.splice,
          variables: { key, bucket },
          view: view(next),
        });
        return { steps, state: next };
      },
    },
  ],
};
