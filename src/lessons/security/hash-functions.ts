import { HASH_MODES, hashFunctionsCode, hashFunctionsSteps, MAX_BYTES } from '../../security/scenarios/hash-functions';
import type { LessonContent } from '../../types/lesson';

const defaults = { mode: HASH_MODES[0]!, text: 'abc', text2: 'abd' };
const firstStep = hashFunctionsSteps(defaults)[0]!;

const content: LessonContent = {
  overview:
    'A hash function turns any input into a short, fixed-size fingerprint called a digest. The same input always gives the same digest, a tiny change gives a completely different one, and you cannot work backwards from the digest. This lesson runs the real SHA-256 on your text, one round at a time.',
  concept: [
    'A digest is a fingerprint, not a secret: anyone can compute it, and there is no key. What it gives you is a short value that stands for much longer data.',
    'A good hash has three properties. You cannot find an input from its digest (preimage resistance). You cannot find a second input with the same digest as a given one (second-preimage resistance). You cannot find any two inputs that share a digest (collision resistance).',
    'SHA-256 pads the message into 64-byte blocks, then runs each block through 64 rounds of rotations, additions and XOR over eight 32-bit registers. Nothing about one round is hard. The strength comes from repeating simple mixing many times.',
    'This code is the real algorithm: the digests match sha256sum. In production, do not write your own. Call your platform\'s library, such as Web Crypto in browsers. MD5 and SHA-1 are broken for collisions, so use SHA-256 or SHA-3 instead.',
  ],
  howItWorks: [
    'The text is turned into bytes with UTF-8.',
    'Padding fills the block: a 0x80 byte, zeros, then the message length in bits.',
    'The 16 words of the block are stretched into a schedule of 64 words.',
    'Each of the 64 rounds mixes one schedule word and one constant into registers a to h.',
    'The final registers are added to the starting values and joined into the 32-byte digest.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'mode', label: 'Mode', type: 'choice', sample: defaults.mode, options: HASH_MODES, help: 'Watch one hash run, or compare the digests of two inputs.' },
      { name: 'text', label: 'Text', type: 'text', sample: defaults.text, help: `Up to ${MAX_BYTES} bytes, so it fits in one block. Empty is allowed.` },
      { name: 'text2', label: 'Second text', type: 'text', sample: defaults.text2, help: 'Used only when comparing.' },
    ],
    presets: [
      { label: 'abc', values: defaults },
      { label: 'One letter changed', values: { ...defaults, mode: HASH_MODES[1]! } },
      { label: 'Empty text', values: { ...defaults, text: '' } },
    ],
    generate: hashFunctionsSteps,
    codeLabel: 'Pseudocode',
  },
  code: hashFunctionsCode,
  prosCons: {
    pros: ['Any amount of data gets the same short digest', 'Anyone can verify a digest with no key', 'Fast enough to hash large files'],
    cons: ['No key, so a digest alone proves nothing about who made it', 'Too fast for passwords, which need a deliberately slow hash', 'A hash that gets broken has to be replaced everywhere it is used'],
    useWhen: ['Checking that a download arrived intact', 'Naming data by its content', 'Signing: a signature covers the digest, not the whole message'],
    avoidWhen: ['Storing passwords: use a slow password hash', 'Proving who sent a message: use a MAC or a signature'],
  },
  applications: [
    'Package managers and app stores compare digests to check downloads',
    'Git names every commit and file by a hash of its content',
    'Digital signatures and TLS certificates sign a digest',
  ],
  commonMistakes: [
    'Thinking hashing is encryption: nothing can be decrypted, and there is no key.',
    'Using a plain hash to prove who sent something: an attacker can hash a new message too.',
    'Storing passwords as plain SHA-256: it is fast, so guesses are fast too.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This is the message "abc" as bytes. How long is the block once padding has been added?',
      view: firstStep.view,
      options: ['64 bytes', '32 bytes', '3 bytes', '56 bytes'],
      answer: 0,
      explanation: 'SHA-256 works on 64-byte blocks. Padding always fills the block, ending with the message length.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'You change one letter of the input. What happens to the digest?',
      options: ['About half of its bits change, in no usable pattern', 'One byte changes', 'Nothing, if the length stays the same', 'Only the last few bits change'],
      answer: 0,
      explanation: 'This is the avalanche effect. A digest tells you nothing about how similar two inputs are.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why does padding include the message length?',
      code: 'block = message + padding   // 0x80, zeros, the length in bits',
      options: ['So two different messages can never pad to the same block', 'To make hashing faster', 'To hide the length from attackers', 'Because the rounds need a key'],
      answer: 0,
      explanation: 'Without the length, a message and the same message with extra zero bytes could pad to identical blocks.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which job does a plain hash do well?',
      options: ['Checking that a file was not corrupted, against a digest from a trusted place', 'Keeping a message secret', 'Proving who wrote a message', 'Storing passwords'],
      answer: 0,
      explanation: 'A hash has no key, so it can show that data matches a digest you trust, but not who made it or how to keep it secret.',
    },
  ],
  summary: [
    'A digest is a short fixed-size fingerprint of any input.',
    'The same input always gives the same digest; a small change gives a very different one.',
    'SHA-256 pads the input, then runs 64 rounds of simple mixing per block.',
    'A hash has no key, so it gives neither secrecy nor proof of who wrote something.',
  ],
};

export default content;
