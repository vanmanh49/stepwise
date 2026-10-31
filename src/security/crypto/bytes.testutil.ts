export function fromHex(text: string): Uint8Array {
  return Uint8Array.from({ length: text.length >> 1 }, (_, i) => parseInt(text.slice(i * 2, i * 2 + 2), 16));
}
