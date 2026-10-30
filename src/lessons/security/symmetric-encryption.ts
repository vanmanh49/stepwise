import { MAX_BYTES, symmetricEncryptionCode, symmetricEncryptionSteps } from '../../security/scenarios/symmetric-encryption';
import type { LessonContent } from '../../types/lesson';

const defaults = { text: 'attack at dawn', key: 'stepwise-demo-16' };
const steps = symmetricEncryptionSteps(defaults);
const beforeShift = steps[steps.findIndex((s) => s.title === 'Round 1: ShiftRows') - 1]!;

const content: LessonContent = {
  overview:
    'Symmetric encryption uses one secret key to scramble data and to unscramble it again. AES is the cipher nearly everything uses. This lesson runs the real AES-128 on one 16-byte block of your text, so you can watch all 10 rounds turn readable bytes into noise.',
  concept: [
    'Symmetric means both sides use the same key. It is very fast, and it protects most of the data on the internet. Its one hard problem is getting the key to both sides safely, which later lessons solve.',
    'AES is a block cipher: it turns exactly 16 bytes into 16 other bytes under a key. The key sizes are 128, 192 and 256 bits. This lesson uses 128, which has 10 rounds.',
    'Two ideas make it strong. Confusion means the link between key and output is complicated, which SubBytes provides. Diffusion means each input bit affects many output bits, which ShiftRows and MixColumns provide. Repeating the rounds does the rest.',
    'A secure cipher is not enough: its security rests entirely on the key, never on keeping the method secret. In production, use AES-256-GCM or ChaCha20-Poly1305 from a vetted library, with keys from a secure random source. Never encrypt with a raw block cipher like this; the next lesson shows why.',
  ],
  howItWorks: [
    'The text and key are each laid out as a 4×4 grid of bytes.',
    'The key is stretched into 11 round keys.',
    'Each round swaps bytes (SubBytes), slides rows (ShiftRows), blends columns (MixColumns) and XORs in the round key (AddRoundKey).',
    'The last round leaves out MixColumns.',
    'The final grid is the ciphertext. Decryption undoes each step in reverse order.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'text', label: 'Text', type: 'text', sample: defaults.text, help: `Up to ${MAX_BYTES} bytes. Shorter text is filled with zero bytes.` },
      { name: 'key', label: 'Key', type: 'text', sample: defaults.key, help: `1 to ${MAX_BYTES} bytes. A real key is random, not a word.` },
    ],
    presets: [
      { label: 'Short text', values: defaults },
      { label: 'Full 16 bytes', values: { ...defaults, text: 'exactly16bytes!!' } },
      { label: 'One key byte changed', values: { ...defaults, key: 'stepwise-demo-17' } },
    ],
    generate: symmetricEncryptionSteps,
    codeLabel: 'Pseudocode',
  },
  code: symmetricEncryptionCode,
  prosCons: {
    pros: ['Very fast, and built into most CPUs', 'Small keys give strong security', 'Decades of public analysis'],
    cons: ['Both sides must already share the key', 'One block at a time, so it needs a mode for real messages', 'Encryption alone does not show whether data was changed'],
    useWhen: ['Encrypting data at rest or in transit', 'You already have a shared key'],
    avoidWhen: ['Two parties have never met: use key exchange first', 'You would be using the raw block cipher: use authenticated encryption'],
  },
  applications: [
    'TLS encrypts web traffic with AES or ChaCha20 once a key is agreed',
    'Disk encryption such as BitLocker and FileVault',
    'Encrypted databases and backups',
  ],
  commonMistakes: [
    'Using a password or a word as the key: keys must come from a secure random source or a key derivation function.',
    'Inventing your own cipher or keeping the method secret: only the key should be secret.',
    'Thinking encrypted means tamper-proof: a change can go unnoticed without authentication.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This state has just been through SubBytes in round 1. What does ShiftRows do next?',
      view: beforeShift.view,
      options: ['Row 0 stays still; rows 1, 2 and 3 slide left by 1, 2 and 3', 'Every byte is swapped using the table', 'Each column is blended', 'The round key is XORed in'],
      answer: 0,
      explanation: 'ShiftRows moves bytes between columns, so that MixColumns can spread them across the block in the next step.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which step uses the key?',
      options: ['Only AddRoundKey', 'All four steps', 'Only SubBytes', 'Only MixColumns'],
      answer: 0,
      explanation: 'The other three steps are fixed and public. The key enters only when the round key is XORed in.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What makes the last round different?',
      code: 'for (round = 1; round <= 10; round++) {\n  state = subBytes(state)\n  state = shiftRows(state)\n  if (round < 10) state = mixColumns(state)\n  state = addRoundKey(state, roundKeys[round])\n}',
      options: ['It has no MixColumns', 'It has no key', 'It runs twice', 'It has no SubBytes'],
      answer: 0,
      explanation: 'Round 10 skips MixColumns, which makes decryption line up neatly with encryption.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What should stay secret in an encryption system?',
      options: ['Only the key', 'The algorithm', 'The algorithm and the key', 'The ciphertext'],
      answer: 0,
      explanation: 'AES is public and has been studied for decades. Its security depends only on the key staying secret.',
    },
  ],
  summary: [
    'Symmetric encryption uses the same key to encrypt and decrypt.',
    'AES turns 16 bytes into 16 bytes through rounds of substitution, shifting, mixing and key addition.',
    'Only AddRoundKey uses the key; the method itself is public.',
    'Real systems use authenticated modes and random keys from a vetted library.',
  ],
};

export default content;
