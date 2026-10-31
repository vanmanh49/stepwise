// Teaching code: never use this for real data. Use your platform's crypto library.

const encoder = new TextEncoder();

export const utf8 = (text: string): Uint8Array => encoder.encode(text);

export const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** XOR over the length of the shorter input. */
export function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  return Uint8Array.from({ length: Math.min(a.length, b.length) }, (_, i) => a[i]! ^ b[i]!);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
