import type { StructureArg } from '../types/lesson';
/** Seeded random numbers for repeatable property tests (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from lo to hi, inclusive. */
export const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

export const pick = <T>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

/** Freezes a value and everything inside it, so a mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** An operation's sample inputs, split the way `run` takes them. */
export function sampleInputs(op: { args: StructureArg[] }): { args: number[]; words: string[] } {
  return {
    args: op.args.flatMap((a) => ('text' in a ? [] : [a.sample])),
    words: op.args.flatMap((a) => ('text' in a ? [a.sample] : [])),
  };
}
