import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, PanelsView, Role, Step } from '../../types/visualization';
import { concat, hex, utf8 } from '../crypto/bytes';
import { INITIAL_STATE, padding, ROUND_K, sha256, traceBlock } from '../crypto/sha256';
import { byteGrid, compareDigests, EMPTY, readBytes } from '../steps';

export const hashFunctionsCode = `function sha256(message) {
  block = message + padding              // 0x80, zeros, the length in bits
  words = schedule(block)                // 16 words stretched to 64
  state = INITIAL_STATE                  // eight fixed words, a to h
  for (round = 0; round < 64; round++) {
    state = mix(state, words[round], K[round])
  }
  return INITIAL_STATE + state           // 32 bytes: the digest
}

function compare(first, second) {
  return bitsDifferent(sha256(first), sha256(second))
}`;

export const HASH_MODES = ['Inside one hash', 'Compare two inputs'];
/** One block holds 64 bytes, and padding needs at least 9 of them. */
export const MAX_BYTES = 55;

const line = (snippet: string) => lineOf(hashFunctionsCode, snippet);
const word = (value: number) => value.toString(16).padStart(8, '0');

function wordGrid(words: readonly number[], prefix: string): GridView {
  const rows: GridView['rows'] = [];
  for (let at = 0; at < words.length; at += 4) {
    rows.push({
      label: String(at),
      cells: words.slice(at, at + 4).map((value, i) => ({ id: `${prefix}-${at + i}`, value: word(value), role: 'default' })),
    });
  }
  return { kind: 'grid', rows };
}

function registers(values: readonly number[]): GridView {
  return {
    kind: 'grid',
    rows: values.map((value, i) => ({
      label: 'abcdefgh'[i]!,
      cells: [{ id: `register-${i}`, value: word(value), role: (i === 0 || i === 4 ? 'active' : 'default') as Role }],
    })),
  };
}

const roundView = (values: readonly number[], w: number, k: number): PanelsView => ({
  kind: 'panels',
  panels: [
    { label: 'Registers', view: registers(values) },
    { label: 'This round', view: { kind: 'grid', rows: [{ label: 'W', cells: [{ id: 'w', value: word(w), role: 'compare' }] }, { label: 'K', cells: [{ id: 'k', value: word(k), role: 'compare' }] }] } },
  ],
});

function insideSteps(text: string): Step[] {
  const message = utf8(text);
  const added = padding(message.length);
  const block = concat(message, added);
  const { schedule, rounds, out } = traceBlock(INITIAL_STATE, block);
  const digest = sha256(message);
  const steps: Step[] = [
    {
      title: `"${text}" is ${message.length} byte${message.length === 1 ? '' : 's'}`,
      why: 'SHA-256 works on bytes, not letters. UTF-8 turns the text into bytes first.',
      next: 'The message is padded to fill a 64-byte block.',
      codeLine: line('function sha256'),
      variables: { bytes: message.length },
      view: byteGrid(message, 'block'),
    },
    {
      title: `Padding adds ${added.length} bytes, making one 64-byte block`,
      why: `The marked bytes are 0x80, then zeros, then the message length in bits (${message.length * 8}). Including the length means two different messages never pad to the same block.`,
      codeLine: line('block = message + padding'),
      variables: { padding: added.length, block: block.length },
      view: byteGrid(block, 'block', (i) => (i < message.length ? 'default' : 'found')),
    },
    {
      title: 'The block is split into 16 words and stretched to 64',
      why: 'Each new word mixes four earlier words with rotations and XOR, so every message bit reaches every later round.',
      codeLine: line('words = schedule(block)'),
      variables: { words: schedule.length },
      view: wordGrid(schedule, 'schedule'),
    },
  ];
  rounds.forEach((values, round) => {
    steps.push({
      title: `Round ${round + 1} of 64: a is now ${word(values[0]!)}`,
      why:
        round === 0
          ? 'Each round mixes one schedule word W and one constant K into the registers. Only a and e get new values; the others shift along one place.'
          : `The registers shift along, and a and e take new values mixed from W[${round}] and K[${round}].`,
      codeLine: line('state = mix('),
      variables: { round: round + 1 },
      view: roundView(values, schedule[round]!, ROUND_K[round]!),
    });
  });
  steps.push({
    title: `Digest: ${hex(digest)}`,
    why: `The last registers are added to the starting words, then joined. It matches sha256sum for the same ${message.length} bytes.`,
    codeLine: line('return INITIAL_STATE + state'),
    variables: { words: out.length, bytes: digest.length },
    view: byteGrid(digest, 'digest', () => 'found'),
  });
  return steps;
}

function compareSteps(first: string, second: string): Step[] {
  const a = sha256(utf8(first));
  const b = sha256(utf8(second));
  const { view, bits } = compareDigests(a, b);
  const same = first === second;
  return [
    {
      title: `The first input "${first}" hashes to ${hex(a).slice(0, 16)}…`,
      why: 'The digest is always 32 bytes, however long the input is.',
      codeLine: line('function compare'),
      view: byteGrid(a, 'digest-a'),
    },
    {
      title: `The second input "${second}" hashes to ${hex(b).slice(0, 16)}…`,
      why: same ? 'Hashing has no randomness, so the same input always gives the same digest.' : 'A different input is hashed from the same starting words.',
      codeLine: line('function compare'),
      view: byteGrid(b, 'digest-b'),
    },
    {
      title: `${bits} of 256 bits changed`,
      why: same
        ? 'The inputs are identical, so the digests are too. That is what lets you use a digest to check a file: in practice, a matching digest means the same bytes.'
        : `Changing the input changed ${bits} output bits, close to half of them, in no pattern you can use. This is the avalanche effect: a digest gives away nothing about how close two inputs are.`,
      codeLine: line('return bitsDifferent'),
      variables: { bits },
      view,
    },
  ];
}

const TITLE = "Can't hash this text";
const LENGTH = { min: 0, max: MAX_BYTES };

export function hashFunctionsSteps(values: Record<string, string>): Step[] {
  const mode = readChoice(values, 'mode', 'Mode', HASH_MODES);
  if (!mode.ok) return refusal(TITLE, mode.why, EMPTY);
  const text = readBytes(values, 'text', 'Text', LENGTH);
  if (!text.ok) return refusal(TITLE, text.why, EMPTY);
  if (mode.value === 'Inside one hash') return insideSteps(text.value);
  const second = readBytes(values, 'text2', 'Second text', LENGTH);
  if (!second.ok) return refusal(TITLE, second.why, EMPTY);
  return compareSteps(text.value, second.value);
}
