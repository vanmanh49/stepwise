import { blockModesCode, blockModesSteps, MAX_MESSAGE, MODES, SCENARIOS, SHAPES } from '../../security/scenarios/block-modes';
import type { LessonContent } from '../../types/lesson';

const defaults = { scenario: SCENARIOS[0]!, mode: MODES[0]!, shape: SHAPES[0]!, message: 'pay $100 to bob' };
const halfway = blockModesSteps(defaults)[3]!;

const content: LessonContent = {
  overview:
    'A block cipher only encrypts 16 bytes at a time. A mode of operation says how to use it on longer data, and a bad choice can undo the encryption. This lesson encrypts a picture to show why ECB leaks, reuses a nonce to read a secret message without the key, and flips a bit to change a payment amount, then shows how authenticated encryption stops that.',
  concept: [
    'ECB encrypts each block on its own, so equal blocks give equal ciphertext. Any repeated data shows through. It is never the right choice.',
    'CBC mixes each block with the ciphertext before it. CTR encrypts a counter and XORs the result in, which turns a block cipher into a stream of random-looking bytes. Both hide patterns, as long as the starting value is handled correctly.',
    'A nonce is a number used once. With CTR, reusing a nonce under the same key reuses the keystream, and XORing the two ciphertexts removes it completely.',
    'None of these modes detects changes. Flipping a CTR ciphertext bit flips the same plaintext bit, and the receiver can\'t tell. Authenticated encryption with associated data (AEAD), such as GCM, adds a tag that must check out before any plaintext is released.',
    'The AES, CBC, CTR and GCM code here is real and matches Node\'s crypto module. In production, use AES-256-GCM or ChaCha20-Poly1305 from a vetted library, and let it choose the nonces where it can. With random 96-bit nonces, rotate the key well before you reach 2^32 messages.',
  ],
  howItWorks: [
    'A picture is split into blocks, and the chosen mode encrypts them row by row.',
    'With nonce reuse, two messages share a keystream, so XORing their ciphertexts cancels it.',
    'XORing the result with the known message reveals the secret one.',
    'With tampering, the attacker flips one ciphertext bit. CTR decrypts the changed message without noticing.',
    'GCM keeps a tag over the ciphertext, so the same flip makes decryption fail.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scenario', label: 'Scenario', type: 'choice', sample: defaults.scenario, options: SCENARIOS, help: 'What to try.' },
      { name: 'mode', label: 'Mode', type: 'choice', sample: defaults.mode, options: MODES, help: 'Used by Patterns. Nonce reuse always runs CTR, and Tampering compares CTR with GCM.' },
      { name: 'shape', label: 'Picture', type: 'choice', sample: defaults.shape, options: SHAPES, help: 'Used by Patterns.' },
      { name: 'message', label: 'Message', type: 'text', sample: defaults.message, help: `1 to ${MAX_MESSAGE} bytes. Used by Nonce reuse and Tampering.` },
    ],
    presets: [
      { label: 'Patterns', values: defaults },
      { label: 'Nonce reuse', values: { ...defaults, scenario: SCENARIOS[1]!, message: 'meet me at noon' } },
      { label: 'Tampering', values: { ...defaults, scenario: SCENARIOS[2]! } },
    ],
    generate: blockModesSteps,
    codeLabel: 'Pseudocode',
  },
  code: blockModesCode,
  prosCons: {
    pros: ['Modes let a 16-byte cipher handle any length of data', 'AEAD gives secrecy and tamper detection in one step', 'CTR and GCM can run blocks in parallel'],
    cons: ['A reused nonce can break CTR and GCM completely', 'Unauthenticated modes let attackers change data unseen', 'Picking and combining these by hand is easy to get wrong'],
    useWhen: ['Encrypting real messages: use an AEAD mode', 'Some data must stay readable but protected: use associated data'],
    avoidWhen: ['ECB: never use it', 'CBC or CTR alone: the data can be changed unseen', 'You can\'t guarantee unique nonces: use a nonce-misuse-resistant mode such as AES-GCM-SIV'],
  },
  applications: [
    'TLS 1.3 only allows AEAD ciphers such as AES-GCM and ChaCha20-Poly1305',
    'Disk and file encryption use dedicated modes for each sector or chunk',
    'Encrypted messaging apps protect every message with AEAD',
  ],
  commonMistakes: [
    'Using ECB because it is the default in an old library.',
    'Reusing a nonce, for example by restarting a counter after a crash.',
    'Encrypting without authenticating, and assuming nobody can change the data.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'ECB has encrypted the first rows. The next row has more white and dark squares. What will they look like?',
      view: halfway.view,
      options: ['Every white square gets one shade and every dark square gets another', 'Every square gets a different shade', 'All squares get the same shade', 'The row is left unencrypted'],
      answer: 0,
      explanation: 'ECB has no state between blocks, so equal blocks under one key always give equal ciphertext.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Two messages were encrypted with CTR under one key and one nonce. What does c1 ^ c2 give an attacker?',
      options: ['message1 ^ message2', 'The key', 'Random noise', 'The nonce'],
      answer: 0,
      explanation: 'Both ciphertexts contain the same keystream, and XOR removes it. If one message is known, the other follows.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why does the changed message get through here?',
      code: 'ciphertext[at] ^= bit\nplain = ctr(key, nonce, ciphertext)',
      options: ['CTR has no check, so any ciphertext decrypts to something', 'The key was weak, so the ciphertext could be guessed', 'The nonce was reused', 'The attacker knew the key, so the change was encrypted again'],
      answer: 0,
      explanation: 'Plain CTR is just XOR with a keystream. Each ciphertext bit decides one plaintext bit, and nothing verifies the result.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What must a receiver do with a GCM message whose tag does not match?',
      options: ['Discard it and release no plaintext', 'Use the plaintext but log a warning', 'Decrypt it again with a new nonce', 'Ask the attacker to resend it'],
      answer: 0,
      explanation: 'A failed tag means the ciphertext can\'t be trusted, so none of it should reach the application.',
    },
  ],
  summary: [
    'A mode says how a block cipher handles more than one block.',
    'ECB leaks patterns because equal blocks stay equal.',
    'Reusing a nonce with CTR or GCM exposes messages.',
    'Only authenticated encryption detects changes, so use an AEAD mode.',
  ],
};

export default content;
