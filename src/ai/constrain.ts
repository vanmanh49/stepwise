import { END, tokenId, VOCAB } from './corpus';
import { forward } from './model';
import { argmax, type Vec } from './tensor';

export const ANIMALS = ['cat', 'dog', 'bird', 'fish'] as const;
export const PLACES = ['mat', 'rug', 'tree', 'park', 'door', 'pond'] as const;
export const FOODS = ['fish', 'bone', 'seed'] as const;

/** A fixed word, or a named field that takes one of the allowed words. */
export type Slot = { word: string } | { name: string; allowed: readonly string[] };

export interface Schema {
  id: 'place' | 'food';
  pattern: string;
  slots: readonly Slot[];
}

const animal: Slot = { name: 'animal', allowed: ANIMALS };

export const SCHEMAS: readonly Schema[] = [
  { id: 'place', pattern: 'the <animal> sat on the <place>', slots: [{ word: 'the' }, animal, { word: 'sat' }, { word: 'on' }, { word: 'the' }, { name: 'place', allowed: PLACES }] },
  { id: 'food', pattern: 'the <animal> ate the <food>', slots: [{ word: 'the' }, animal, { word: 'ate' }, { word: 'the' }, { name: 'food', allowed: FOODS }] },
];

export interface DecodeStep {
  /** Index into the schema's slots. */
  slot: number;
  /** The model's probabilities before any cut. */
  raw: Vec;
  /** After the cut and renormalising (the raw ones when unconstrained). */
  probs: Vec;
  /** Ids the slot does not allow; empty when unconstrained. */
  cut: number[];
  chosen: number;
  /** The chosen word fits the slot. */
  valid: boolean;
}

export interface Decoded {
  steps: DecodeStep[];
  words: string[];
  /** Each named slot that was reached, with its word. */
  json: Record<string, string>;
  /** Every slot reached and every step valid. */
  valid: boolean;
}

const allows = (slot: Slot, word: string) => ('word' in slot ? slot.word === word : slot.allowed.includes(word));

/** Starts from the schema's first word ("the") as the prompt; one step per remaining slot. */
export function decode(schema: Schema, constrained: boolean): Decoded {
  const first = schema.slots[0] as { word: string };
  const tokens = [tokenId(first.word)!];
  const steps: DecodeStep[] = [];
  const json: Record<string, string> = {};
  for (let s = 1; s < schema.slots.length; s++) {
    const slot = schema.slots[s]!;
    const raw = forward(tokens).probs.at(-1)!;
    const cut = constrained ? VOCAB.map((_, i) => i).filter((i) => !allows(slot, VOCAB[i]!)) : [];
    const cutSet = new Set(cut);
    const kept = raw.reduce((sum, p, i) => (cutSet.has(i) ? sum : sum + p), 0);
    const probs = constrained ? raw.map((p, i) => (cutSet.has(i) ? 0 : p / kept)) : raw;
    const chosen = argmax(probs);
    const word = VOCAB[chosen]!;
    steps.push({ slot: s, raw, probs, cut, chosen, valid: allows(slot, word) });
    if ('name' in slot) json[slot.name] = word;
    tokens.push(chosen);
    if (word === END) break;
  }
  return {
    steps,
    words: tokens.map((t) => VOCAB[t]!),
    json,
    valid: steps.length === schema.slots.length - 1 && steps.every((s) => s.valid),
  };
}
