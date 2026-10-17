import type { Step, View } from '../types/visualization';

/** Parsing helpers for `form` lessons: generators read their own fields and refuse bad input with one step. */
export type Read<T> = { ok: true; value: T } | { ok: false; why: string };

type Values = Record<string, string>;

const WHOLE = /^-?\d+$/;

export function readInt(values: Values, name: string, label: string, range: { min: number; max: number }): Read<number> {
  const text = (values[name] ?? '').trim();
  const value = Number(text);
  if (!WHOLE.test(text) || value < range.min || value > range.max) {
    return { ok: false, why: `${label} must be a whole number from ${range.min} to ${range.max}.` };
  }
  return { ok: true, value };
}

export function readInts(
  values: Values,
  name: string,
  label: string,
  count: { min: number; max: number },
  range: { min: number; max: number },
): Read<number[]> {
  const tokens = (values[name] ?? '').split(/[\s,]+/).filter(Boolean);
  const plural = count.max === 1 ? '' : 's';
  if (tokens.length < count.min || tokens.length > count.max) {
    return {
      ok: false,
      why: `${label} needs ${count.min === count.max ? count.min : `${count.min} to ${count.max}`} number${plural}, separated by commas.`,
    };
  }
  const numbers = tokens.map(Number);
  if (tokens.some((t, i) => !WHOLE.test(t) || numbers[i]! < range.min || numbers[i]! > range.max)) {
    return { ok: false, why: `Each value in ${label} must be a whole number from ${range.min} to ${range.max}.` };
  }
  return { ok: true, value: numbers };
}

export function readText(values: Values, name: string, label: string, length: { min: number; max: number }): Read<string> {
  const text = values[name] ?? '';
  // Characters such as emoji take two slots in a JavaScript string, which would break "one cell per character".
  if (/[\uD800-\uDFFF]/.test(text)) return { ok: false, why: `${label} must use plain letters, digits and punctuation (no emoji).` };
  if (text.length < length.min || text.length > length.max) {
    return { ok: false, why: `${label} must be ${length.min} to ${length.max} characters long so every step stays readable.` };
  }
  return { ok: true, value: text };
}

/** The single step a generator returns for unusable input. */
export function refusal(title: string, why: string, view: View): Step[] {
  return [{ title, why, codeLine: 1, view }];
}
