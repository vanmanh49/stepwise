export type ParseResult = { ok: true; values: number[] } | { ok: false; error: string };

const MIN_VALUE = -999;
const MAX_VALUE = 999;

export function parseNumberList(text: string, limits: { min: number; max: number }): ParseResult {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Enter some numbers separated by commas, like 5, 2, 8.' };

  const bad = tokens.find((t) => !/^-?\d+$/.test(t));
  if (bad !== undefined) return { ok: false, error: `"${bad}" is not a whole number. Use integers such as 5, -2, 8.` };

  const values = tokens.map(Number);
  if (values.some((v) => v < MIN_VALUE || v > MAX_VALUE)) {
    return { ok: false, error: `Use values between ${MIN_VALUE} and ${MAX_VALUE}.` };
  }
  if (values.length < limits.min) {
    return { ok: false, error: `Enter at least ${limits.min} number${limits.min === 1 ? '' : 's'}.` };
  }
  if (values.length > limits.max) {
    return { ok: false, error: `Enter at most ${limits.max} numbers so every step stays readable.` };
  }
  return { ok: true, values };
}

export function randomArray(length: number, max = 99): number[] {
  return Array.from({ length }, () => 1 + Math.floor(Math.random() * max));
}
