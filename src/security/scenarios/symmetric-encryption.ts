import { refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, PanelsView, Role, Step } from '../../types/visualization';
import { traceBlock, type AesOp } from '../crypto/aes';
import { hex, utf8 } from '../crypto/bytes';
import { EMPTY, readBytes, stateGrid } from '../steps';

export const symmetricEncryptionCode = `function encrypt(block, key) {
  roundKeys = expandKey(key)             // 11 keys, 16 bytes each
  state = addRoundKey(block, roundKeys[0])
  for (round = 1; round <= 10; round++) {
    state = subBytes(state)              // swap each byte using a table
    state = shiftRows(state)             // slide each row sideways
    if (round < 10) state = mixColumns(state) // blend each column
    state = addRoundKey(state, roundKeys[round])
  }
  return state                           // 16 bytes of ciphertext
}`;

export const MAX_BYTES = 16;

const line = (snippet: string) => lineOf(symmetricEncryptionCode, snippet);

const OP_LINE: Record<AesOp['op'], string> = {
  SubBytes: 'state = subBytes(state)',
  ShiftRows: 'state = shiftRows(state)',
  MixColumns: 'state = mixColumns(state)',
  AddRoundKey: 'state = addRoundKey(state, roundKeys[round])',
};

const OP_WHY: Record<AesOp['op'], string> = {
  SubBytes: 'Each byte is swapped using a fixed table. This is the only step that is not simple arithmetic, and it stops the cipher being solved like a set of equations.',
  ShiftRows: 'Row 0 stays still and rows 1, 2 and 3 slide left by 1, 2 and 3 places. Bytes from one column now reach other columns.',
  MixColumns: 'Each column is blended, so every byte in it now depends on all four. With ShiftRows, one changed byte spreads across the whole block in two rounds.',
  AddRoundKey: 'The state is XORed with this round\'s key. This is the only step that uses the key.',
};

function toBlock(bytes: Uint8Array): Uint8Array {
  const block = new Uint8Array(MAX_BYTES);
  block.set(bytes);
  return block;
}

function view(state: Uint8Array, previous: Uint8Array, roundKey: Uint8Array): PanelsView {
  const changed = (i: number): Role => (state[i] === previous[i] ? 'default' : 'compare');
  return {
    kind: 'panels',
    panels: [
      { label: 'State', view: stateGrid(state, 'state', changed) },
      { label: 'Round key', view: stateGrid(roundKey, 'key') },
    ],
  };
}

function roundKeyList(roundKeys: Uint8Array[]): GridView {
  return {
    kind: 'grid',
    rows: roundKeys.map((roundKey, round) => ({ label: String(round), cells: [{ id: `round-key-${round}`, value: hex(roundKey), role: 'default' }] })),
  };
}

const TITLE = "Can't encrypt this";

export function symmetricEncryptionSteps(values: Record<string, string>): Step[] {
  const text = readBytes(values, 'text', 'Text', { min: 0, max: MAX_BYTES });
  if (!text.ok) return refusal(TITLE, text.why, EMPTY);
  const keyText = readBytes(values, 'key', 'Key', { min: 1, max: MAX_BYTES });
  if (!keyText.ok) return refusal(TITLE, keyText.why, EMPTY);

  const textBytes = utf8(text.value);
  const keyBytes = utf8(keyText.value);
  const block = toBlock(textBytes);
  const key = toBlock(keyBytes);
  const { roundKeys, ops, out } = traceBlock(key, block);
  const padded = textBytes.length < MAX_BYTES || keyBytes.length < MAX_BYTES;

  const steps: Step[] = [
    {
      title: 'Text and key become 16-byte blocks',
      why: `AES-128 always works on exactly 16 bytes, written as a 4×4 grid filled column by column.${padded ? ' Shorter input is filled up with zero bytes here so the lesson can show one block. Real systems use a mode, from the next lesson.' : ''}`,
      next: 'The key is stretched into one key per round.',
      codeLine: line('function encrypt'),
      variables: { 'text bytes': textBytes.length, 'key bytes': keyBytes.length },
      view: { kind: 'panels', panels: [{ label: 'Block', view: stateGrid(block, 'state') }, { label: 'Key', view: stateGrid(key, 'key') }] },
    },
    {
      title: 'Key expansion makes 11 round keys',
      why: 'Each round gets its own key, and each one is built from the one before, so every key bit affects many rounds.',
      codeLine: line('roundKeys = expandKey'),
      variables: { 'round keys': roundKeys.length },
      view: roundKeyList(roundKeys),
    },
  ];

  let previous = block;
  for (const { round, op, state } of ops) {
    steps.push({
      title: round === 0 ? 'Round 0: AddRoundKey mixes in the first key' : `Round ${round}: ${op}`,
      why: round === 10 && op === 'ShiftRows' ? `${OP_WHY.ShiftRows} The last round has no MixColumns.` : OP_WHY[op],
      codeLine: line(round === 0 ? 'state = addRoundKey(block' : OP_LINE[op]),
      variables: { round, operation: op },
      view: view(state, previous, roundKeys[round]!),
    });
    previous = state;
  }

  steps.push({
    title: `Ciphertext: ${hex(out)}`,
    why: 'This matches AES-128 in any library for the same block and key. Without the key, these 16 bytes look random. Decryption runs the same steps backwards.',
    codeLine: line('return state'),
    variables: { bytes: out.length },
    view: stateGrid(out, 'state', () => 'found'),
  });
  return steps;
}
