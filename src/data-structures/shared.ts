import type { StructureArg } from '../types/lesson';
import type { Step, View } from '../types/visualization';

export const MAX_LINEAR_ITEMS = 10;

/** Result for an operation that cannot run: one explanatory step, state untouched. */
export function refuse(
  state: number[],
  view: View,
  title: string,
  why: string,
  codeLine: number,
): { steps: Step[]; state: number[] } {
  return { steps: [{ title, why, codeLine, view }], state };
}

export function isFull(state: number[]): boolean {
  return state.length >= MAX_LINEAR_ITEMS;
}

export const FULL_WHY = `This visualization holds at most ${MAX_LINEAR_ITEMS} items so every step stays readable. Remove something first.`;

/** A word argument: 1–8 lowercase letters. */
export const WORD_PATTERN = /^[a-z]{1,8}$/;

/** Reads an operation's fields: numbers into `args` and words into `words`, each in field order. */
export function parseOpFields(
  op: { label: string; args: StructureArg[] },
  fields: string[],
): { ok: true; args: number[]; words: string[] } | { ok: false; error: string } {
  const args: number[] = [];
  const words: string[] = [];
  for (const [i, arg] of op.args.entries()) {
    const field = (fields[i] ?? '').trim();
    if ('text' in arg) {
      const word = field.toLowerCase();
      if (!WORD_PATTERN.test(word)) return { ok: false, error: `${op.label}: enter a word of 1–8 letters (a–z) for ${arg.label}.` };
      words.push(word);
    } else {
      if (!/^-?\d{1,3}$/.test(field)) return { ok: false, error: `${op.label}: enter a whole number between -999 and 999 for ${arg.label}.` };
      args.push(Number(field));
    }
  }
  return { ok: true, args, words };
}

/** An operation's sample inputs, split the way `run` takes them. */
export function sampleInputs(op: { args: StructureArg[] }): { args: number[]; words: string[] } {
  return {
    args: op.args.flatMap((a) => ('text' in a ? [] : [a.sample])),
    words: op.args.flatMap((a) => ('text' in a ? [a.sample] : [])),
  };
}

/** The 1-based line of `code` containing `snippet`; throws if absent, so a code edit can't silently misplace steps. */
export function lineOf(code: string, snippet: string): number {
  const line = code.split('\n').findIndex((l) => l.includes(snippet)) + 1;
  if (line === 0) throw new Error(`Code has no line containing ${snippet}`);
  return line;
}
