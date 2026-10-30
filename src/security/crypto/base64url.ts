// Teaching code: never use this for real data. Use your platform's crypto library.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** RFC 4648 §5 with no padding: every 3 bytes become 4 letters. */
export function encodeBase64url(bytes: Uint8Array): string {
  let out = '';
  for (let at = 0; at < bytes.length; at += 3) {
    const chunk = bytes.subarray(at, at + 3);
    const bits = (chunk[0]! << 16) | ((chunk[1] ?? 0) << 8) | (chunk[2] ?? 0);
    for (let i = 0; i <= chunk.length; i++) out += ALPHABET[(bits >> (18 - i * 6)) & 63];
  }
  return out;
}

export function decodeBase64url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const values = Array.from(text, (letter) => ALPHABET.indexOf(letter));
  if (values.includes(-1)) return null;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  for (let i = 0; i < out.length; i++) {
    const bit = i * 8;
    const at = Math.floor(bit / 6);
    const pair = (values[at]! << 6) | (values[at + 1] ?? 0);
    out[i] = (pair >> (4 - (bit % 6))) & 255;
  }
  return out;
}
