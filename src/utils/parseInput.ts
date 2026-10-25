import { readInts, readText } from '../algorithms/form';

export type ParseResult = { ok: true; values: number[] } | { ok: false; error: string };

/** A list typed into "Your data": the same rules as a form lesson's number list. */
export function parseNumberList(text: string, limits: { min: number; max: number }): ParseResult {
  const read = readInts({ data: text }, 'data', 'Your data', limits, { min: -999, max: 999 });
  return read.ok ? { ok: true, values: read.value } : { ok: false, error: read.why };
}

export const MAX_TEXT_LENGTH = 12;

export function parseText(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const read = readText({ text }, 'text', 'Text', { min: 1, max: MAX_TEXT_LENGTH });
  return read.ok ? read : { ok: false, error: read.why };
}

export function randomArray(length: number, max = 99, min = 1): number[] {
  return Array.from({ length }, () => min + Math.floor(Math.random() * (max - min + 1)));
}
