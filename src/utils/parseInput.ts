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

export const MAX_TEXT_LENGTH = 12;

export function parseText(text: string): { ok: true; value: string } | { ok: false; error: string } {
  if (text.length === 0) return { ok: false, error: 'Type at least one character.' };
  // Characters such as emoji take two slots in a JavaScript string, which would break "one cell per character".
  if (/[\uD800-\uDFFF]/.test(text)) return { ok: false, error: 'Use plain letters, digits and punctuation (no emoji).' };
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `Use at most ${MAX_TEXT_LENGTH} characters so every step stays readable.` };
  }
  return { ok: true, value: text };
}

export function randomArray(length: number, max = 99, min = 1): number[] {
  return Array.from({ length }, () => min + Math.floor(Math.random() * (max - min + 1)));
}
