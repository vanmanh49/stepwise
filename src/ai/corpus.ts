/** The toy world the tiny model learns from: 30 short sentences over 33 words. */
export const CORPUS: readonly string[] = [
  'the cat sat on the mat',
  'the dog sat on the rug',
  'a cat slept on the mat',
  'a dog slept on the rug',
  'the cat napped on the mat',
  'the dog napped on the rug',
  'the cat chased the bird',
  'the dog chased the ball',
  'the bird sang in the tree',
  'a bird sat in the tree',
  'the cat ate the fish',
  'the dog ate the bone',
  'the cat saw the dog',
  'the dog saw the cat',
  'a cat ran to the mat',
  'a dog ran to the park',
  'the bird flew to the tree',
  'the dog played in the park',
  'the cat played with the ball',
  'the bird ate the seed',
  'the cat sat by the door',
  'the dog sat by the door',
  'a cat is on the mat',
  'a dog is in the park',
  'the bird is in the tree',
  'the cat likes the fish',
  'the dog likes the bone',
  'the bird likes the seed',
  'the fish swam in the pond',
  'a fish is in the pond',
];

/** Marks the end of a sentence; the model predicts it like any word. */
export const END = '<end>';

/** Every corpus word in order of first appearance, then END. A token's id is its index here. */
export const VOCAB: readonly string[] = [...new Set(CORPUS.flatMap((s) => s.split(' '))), END];

const IDS = new Map(VOCAB.map((w, i) => [w, i]));

export function tokenId(word: string): number | undefined {
  return IDS.get(word);
}

/** A corpus sentence's token ids (corpus words only). */
export function tokenize(sentence: string): number[] {
  return sentence.split(' ').map((w) => IDS.get(w)!);
}
