import { ATTACKERS, keyExchangeCode, keyExchangeSteps, PRIMES } from '../../security/scenarios/key-exchange';
import type { LessonContent } from '../../types/lesson';

const defaults = { prime: PRIMES[0]!, a: '6', b: '15', attacker: ATTACKERS[0]! };
const steps = keyExchangeSteps(defaults);
const beforeKey = steps[2]!;

const content: LessonContent = {
  overview:
    'Two strangers can agree on a shared secret while everyone listens. Diffie-Hellman key exchange makes that possible, and it starts almost every secure connection. This lesson runs the real math with numbers small enough to follow, then shows the two things that can go wrong: small numbers fall to an eavesdropper, and an attacker who can change messages can get between the two sides.',
  concept: [
    'Symmetric encryption needs a shared key, but sending a key over an open network gives it away. Diffie-Hellman avoids sending the key at all. Each side keeps a secret and sends only a public share, and both can compute the same result from their own secret and the other side\'s share.',
    'It works because of a one-way function. Computing g^a mod p is quick. Finding a from the result, the discrete logarithm, is very slow when p is large. And (g^a)^b and (g^b)^a are the same number, so both sides reach g^(a × b).',
    'An eavesdropper sees p, g, A and B, but can\'t compute the key without solving the discrete logarithm. That only holds when the numbers are huge: the primes here are small enough to search in a moment.',
    'Plain Diffie-Hellman proves nothing about who is on the other end. An attacker who can change messages can run a separate exchange with each side. The answer is to sign the shares, which needs the signatures of the next lesson.',
    'The math here is real, but these primes are toys and offer no protection at all. In production, use X25519 or a hybrid post-quantum exchange such as X25519MLKEM768 through TLS or a vetted library, with fresh secrets for every session so that a stolen key can\'t unlock old traffic.',
  ],
  howItWorks: [
    'Both sides agree on a public prime p and generator g.',
    'Each picks a secret, computes a share g^secret mod p, and sends the share.',
    'Each raises the other side\'s share to their own secret, and both reach the same key.',
    'An eavesdropper can only search for the secret, which works here because p is tiny.',
    'A man in the middle swaps both shares and ends up with one key for each side.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'prime', label: 'Prime p', type: 'choice', sample: defaults.prime, options: PRIMES, help: 'All of these are far too small for real use.' },
      { name: 'a', label: 'Alice\'s secret a', type: 'number', sample: defaults.a, help: 'From 2 to p − 2.' },
      { name: 'b', label: 'Bob\'s secret b', type: 'number', sample: defaults.b, help: 'From 2 to p − 2.' },
      { name: 'attacker', label: 'Attacker', type: 'choice', sample: defaults.attacker, options: ATTACKERS, help: 'An eavesdropper only reads. A man in the middle can change messages.' },
    ],
    presets: [
      { label: 'No attacker', values: defaults },
      { label: 'Eavesdropper', values: { ...defaults, attacker: ATTACKERS[1]! } },
      { label: 'Man in the middle', values: { ...defaults, attacker: ATTACKERS[2]! } },
    ],
    generate: keyExchangeSteps,
    codeLabel: 'Pseudocode',
  },
  code: keyExchangeCode,
  prosCons: {
    pros: ['Two parties can agree on a key with no earlier contact', 'The key itself never crosses the network', 'Fresh secrets per session protect past traffic if a long-term key leaks later'],
    cons: ['Proves nothing about who is on the other end', 'Needs signatures or certificates to stop a man in the middle', 'Safe only with large, well-chosen groups'],
    useWhen: ['Starting any encrypted connection', 'You want forward secrecy for each session'],
    avoidWhen: ['You can\'t authenticate the other side: add signatures first', 'Using home-made or small groups: use X25519'],
  },
  applications: [
    'Every TLS 1.3 connection starts with a Diffie-Hellman style exchange',
    'SSH agrees on its session key this way',
    'Signal and other messaging apps run exchanges to protect each conversation',
  ],
  commonMistakes: [
    'Thinking key exchange also proves who you are talking to.',
    'Reusing the same secret for many sessions, which loses forward secrecy.',
    'Choosing your own prime instead of a standard, vetted group or curve.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Alice has sent A = 8 and Bob has sent B = 19, with p = 23. Alice\'s secret is a = 6. What key does Alice compute?',
      view: beforeKey.view,
      options: ['2 (19^6 mod 23)', '8 (5^6 mod 23)', '19 (the share Bob sent)', '6 (the secret itself)'],
      answer: 0,
      explanation: '19^6 mod 23 = 2. Bob gets the same value from 8^15 mod 23, and 2 never crossed the network.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does an eavesdropper need to do to find the key?',
      options: ['Solve a discrete logarithm: find a from A', 'Read the key off the wire', 'Add A and B together', 'Nothing, the key is public'],
      answer: 0,
      explanation: 'The key is never sent. Without a or b, the eavesdropper has to work backwards from A or B, which is slow when p is large.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why do both sides reach the same number?',
      code: 'aliceKey = B ^ a mod p\nbobKey = A ^ b mod p',
      options: ['Both equal g ^ (a * b) mod p', 'A and B are equal', 'a and b are equal', 'p cancels out'],
      answer: 0,
      explanation: 'B ^ a is (g ^ b) ^ a, and A ^ b is (g ^ a) ^ b. Powers multiply, and the order does not matter.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A man in the middle replaces both shares. Why do Alice and Bob not notice?',
      options: ['Nothing in plain Diffie-Hellman proves who sent a share', 'The attacker has guessed the prime', 'The keys are the same', 'Encryption hides the swap'],
      answer: 0,
      explanation: 'A share is only a number. Signing it with a key the other side trusts is what ties it to a real identity.',
    },
  ],
  summary: [
    'Diffie-Hellman lets two strangers agree on a key without ever sending it.',
    'Its safety rests on the discrete logarithm being hard, which needs very large numbers.',
    'On its own it proves nothing about identity, so a man in the middle can get between the two sides.',
    'Real systems sign the exchange and use a fresh secret for every session.',
  ],
};

export default content;
