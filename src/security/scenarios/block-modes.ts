import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { PanelsView, Step } from '../../types/visualization';
import { hex, utf8, xor } from '../crypto/bytes';
import { cbc, ctr, ecb, gcmDecrypt, gcmEncrypt } from '../crypto/modes';
import { byteGrid, EMPTY, imageGrid, readBytes } from '../steps';

export const blockModesCode = `// how each mode encrypts block i
ecb: out[i] = aes(key, block[i])
cbc: out[i] = aes(key, block[i] ^ out[i - 1])
ctr: out[i] = block[i] ^ aes(key, nonce + i)
gcm: as ctr, plus a tag over the ciphertext

// nonce reuse: one keystream, two messages
c1 = message1 ^ keystream
c2 = message2 ^ keystream
c1 ^ c2 == message1 ^ message2

// tampering: one bit flipped on the wire
ciphertext[at] ^= bit
plain = ctr(key, nonce, ciphertext)    // no check at all
plain = gcmDecrypt(key, nonce, ciphertext, tag)  // refused if the tag fails`;

export const SCENARIOS = ['Patterns', 'Nonce reuse', 'Tampering'];
export const MODES = ['ECB', 'CBC', 'CTR', 'GCM'];
export const SHAPES = ['Smiley', 'Stripes', 'Checkerboard'];
export const MAX_MESSAGE = 32;

const KEY = utf8('stepwise-demo-16');
const IV = Uint8Array.from({ length: 16 }, (_, i) => i);
const GCM_IV = IV.slice(0, 12);
export const KNOWN_MESSAGE = 'PUBLIC NOTICE: OFFICE CLOSED';

const line = (snippet: string) => lineOf(blockModesCode, snippet);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** Each pixel is one 16-byte block, all white (0x00) or all dark (0xff). */
const BITMAPS: Record<string, string[]> = {
  Smiley: ['......', '.#..#.', '......', '#....#', '.####.', '......'],
  Stripes: ['######', '......', '######', '......', '######', '......'],
  Checkerboard: ['#.#.#.', '.#.#.#', '#.#.#.', '.#.#.#', '#.#.#.', '.#.#.#'],
};
const BLOCKS = 36;
const SIDE = 6;

const MODE_LINE: Record<string, string> = { ECB: 'ecb: out[i]', CBC: 'cbc: out[i]', CTR: 'ctr: out[i]', GCM: 'gcm: as ctr' };

const MODE_WHY: Record<string, string> = {
  ECB: 'ECB encrypts every block on its own, so equal blocks stay equal. The shape survives, and anyone can see it without the key.',
  CBC: 'CBC mixes each block with the ciphertext before it, so equal blocks come out different. The shape is gone.',
  CTR: 'CTR encrypts a counter and XORs it in, so every block gets its own keystream. The shape is gone.',
  GCM: 'GCM encrypts like CTR, so the shape is gone, and it also adds a tag that detects changes.',
};

function encryptImage(mode: string, pixels: Uint8Array): Uint8Array {
  if (mode === 'ECB') return ecb(KEY, pixels);
  if (mode === 'CBC') return cbc(KEY, IV, pixels);
  if (mode === 'CTR') return ctr(KEY, IV, pixels);
  return gcmEncrypt(KEY, GCM_IV, pixels).ciphertext;
}

function patternSteps(mode: string, shape: string): Step[] {
  const dark = BITMAPS[shape]!.join('').split('').map((c) => c === '#');
  const pixels = new Uint8Array(BLOCKS * 16);
  dark.forEach((on, i) => pixels.fill(on ? 0xff : 0, i * 16, (i + 1) * 16));
  const cipher = encryptImage(mode, pixels);
  const block = (i: number) => cipher.subarray(i * 16, i * 16 + 16);
  const plain = imageGrid(dark.map((on) => (on ? 1 : 0)), dark.map((on) => (on ? 'ff' : '00')), 'plain');

  const shown = (rows: number): PanelsView => {
    const seen = (i: number) => i < rows * SIDE;
    return {
      kind: 'panels',
      panels: [
        { label: 'Picture', view: plain },
        {
          label: `${mode} ciphertext`,
          view: imageGrid(
            dark.map((_, i) => (seen(i) ? block(i)[0]! / 255 : 0)),
            dark.map((_, i) => (seen(i) ? hex(block(i).subarray(0, 1)) : '')),
            'cipher',
          ),
        },
      ],
    };
  };

  const distinct = new Set(dark.map((_, i) => hex(block(i)))).size;
  const steps: Step[] = [
    {
      title: `The ${shape.toLowerCase()} picture is ${BLOCKS} blocks of 16 bytes`,
      why: 'Each square stands for one 16-byte block: all zeros for white, all 0xff for dark. Each encrypted square is shaded by the first byte of its block.',
      next: `${mode} encrypts them row by row.`,
      codeLine: line('how each mode encrypts'),
      variables: { blocks: BLOCKS },
      view: shown(0),
    },
  ];
  for (let row = 1; row <= SIDE; row++) {
    steps.push({
      title: `${mode} encrypts row ${row} of ${SIDE}`,
      why: row === 1 ? 'Watch whether equal squares in the picture get equal shades in the ciphertext.' : `Row ${row} goes through the same steps with the same key.`,
      codeLine: line(MODE_LINE[mode]!),
      variables: { row },
      view: shown(row),
    });
  }
  steps.push({
    title: `${mode} gives ${distinct} different block${distinct === 1 ? '' : 's'} out of ${BLOCKS}`,
    why: MODE_WHY[mode]!,
    codeLine: line(MODE_LINE[mode]!),
    variables: { 'different blocks': distinct },
    view: shown(SIDE),
  });
  return steps;
}

function nonceReuseSteps(messageText: string): Step[] {
  const known = utf8(KNOWN_MESSAGE);
  const secret = utf8(messageText);
  const c1 = ctr(KEY, IV, known);
  const c2 = ctr(KEY, IV, secret);
  const mixed = xor(c1, c2);
  const recovered = xor(mixed, known);
  const whole = recovered.length === secret.length;
  const text = decode(recovered);
  return [
    {
      title: 'Two messages are encrypted with CTR and the same nonce',
      why: `The first is public: "${KNOWN_MESSAGE}". The second is secret. Reusing the nonce means both are XORed with the same keystream.`,
      codeLine: line('c2 = message2 ^ keystream'),
      view: { kind: 'panels', panels: [{ label: 'Ciphertext 1', view: byteGrid(c1, 'c1') }, { label: 'Ciphertext 2', view: byteGrid(c2, 'c2') }] },
    },
    {
      title: 'XORing the ciphertexts cancels the keystream',
      why: 'Anything XORed with itself is zero, so the keystream disappears. What remains is the two messages XORed together. The attacker did this without the key.',
      codeLine: line('c1 ^ c2 == message1 ^ message2'),
      variables: { bytes: mixed.length },
      view: byteGrid(mixed, 'mixed', () => 'compare'),
    },
    {
      title: `Attacker recovers "${text}"${whole ? '' : ` (first ${recovered.length} bytes)`}`,
      why: `XORing with the public message leaves the secret one. The attacker recovered ${recovered.length} of its ${secret.length} bytes${whole ? '' : `, because the known message is only ${known.length} bytes long`}. A nonce must never be used twice with one key.`,
      codeLine: line('c1 ^ c2 == message1 ^ message2'),
      variables: { recovered: recovered.length },
      view: byteGrid(recovered, 'recovered', () => 'found'),
    },
  ];
}

function tamperingSteps(messageText: string): Step[] {
  const message = utf8(messageText);
  const digit = message.findIndex((byte) => byte >= 0x30 && byte <= 0x39);
  const at = digit === -1 ? 0 : digit;
  const bit = digit === -1 ? 1 : 0x08;
  const flipped = (bytes: Uint8Array) => {
    const out = bytes.slice();
    out[at]! ^= bit;
    return out;
  };
  const flipWhy =
    digit === -1
      ? 'There is no digit to change, so the attacker flips the lowest bit of byte 0.'
      : `Flipping bit 3 of byte ${at} turns the digit ${String.fromCharCode(message[at]!)} into ${String.fromCharCode(message[at]! ^ bit)}. The attacker has no key, only a guess at the message format.`;

  const ctrCipher = ctr(KEY, IV, message);
  const ctrForged = flipped(ctrCipher);
  const ctrPlain = ctr(KEY, IV, ctrForged);
  const sealed = gcmEncrypt(KEY, GCM_IV, message);
  const gcmForged = flipped(sealed.ciphertext);
  const opened = gcmDecrypt(KEY, GCM_IV, gcmForged, sealed.tag);
  const flagged = (i: number) => (i === at ? ('compare' as const) : ('default' as const));

  return [
    {
      title: `CTR encrypts "${messageText}"`,
      why: 'CTR XORs the message with a keystream, so each ciphertext bit lines up with one message bit.',
      codeLine: line('ctr: out[i]'),
      view: byteGrid(ctrCipher, 'cipher'),
    },
    {
      title: `Attacker flips one bit of byte ${at} on the wire`,
      why: flipWhy,
      codeLine: line('ciphertext[at] ^= bit'),
      variables: { byte: at },
      view: byteGrid(ctrForged, 'cipher', flagged),
    },
    {
      title: `CTR decrypts to "${decode(ctrPlain)}" and nothing notices`,
      why: 'The flipped ciphertext bit flips the same plaintext bit. CTR has no way to tell: encryption alone does not protect against changes.',
      codeLine: line('plain = ctr(key'),
      variables: { result: 'accepted' },
      view: byteGrid(ctrPlain, 'plain', flagged),
    },
    {
      title: `GCM encrypts the same message and adds a tag: ${hex(sealed.tag).slice(0, 16)}…`,
      why: 'GCM encrypts like CTR, then computes a tag over the ciphertext with a key derived from the secret key.',
      codeLine: line('gcm: as ctr'),
      view: { kind: 'panels', panels: [{ label: 'Ciphertext', view: byteGrid(sealed.ciphertext, 'cipher') }, { label: 'Tag', view: byteGrid(sealed.tag, 'tag') }] },
    },
    {
      title: 'Attacker flips the same bit',
      why: 'The attacker can change the ciphertext, but cannot compute a new tag without the key.',
      codeLine: line('ciphertext[at] ^= bit'),
      variables: { byte: at },
      view: { kind: 'panels', panels: [{ label: 'Ciphertext', view: byteGrid(gcmForged, 'cipher', flagged) }, { label: 'Tag', view: byteGrid(sealed.tag, 'tag') }] },
    },
    {
      title: opened ? 'GCM accepts the message' : 'GCM refuses the message: the tag does not match',
      why: 'GCM checks the tag before releasing any plaintext. The receiver gets an error, not a changed message. This is authenticated encryption.',
      codeLine: line('plain = gcmDecrypt'),
      variables: { result: opened ? 'accepted' : 'refused' },
      view: byteGrid(sealed.tag, 'tag', () => 'discarded'),
    },
  ];
}

const TITLE = "Can't run this scenario";

export function blockModesSteps(values: Record<string, string>): Step[] {
  const scenario = readChoice(values, 'scenario', 'Scenario', SCENARIOS);
  if (!scenario.ok) return refusal(TITLE, scenario.why, EMPTY);
  const mode = readChoice(values, 'mode', 'Mode', MODES);
  if (!mode.ok) return refusal(TITLE, mode.why, EMPTY);
  const shape = readChoice(values, 'shape', 'Shape', SHAPES);
  if (!shape.ok) return refusal(TITLE, shape.why, EMPTY);
  if (scenario.value === 'Patterns') return patternSteps(mode.value, shape.value);
  const message = readBytes(values, 'message', 'Message', { min: 1, max: MAX_MESSAGE });
  if (!message.ok) return refusal(TITLE, message.why, EMPTY);
  return scenario.value === 'Nonce reuse' ? nonceReuseSteps(message.value) : tamperingSteps(message.value);
}
