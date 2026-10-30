import { EXPONENT_RANGE, MAX_MESSAGE, OPERATIONS, PRIME_RANGE, publicKeySignaturesCode, publicKeySignaturesSteps, TAMPER } from '../../security/scenarios/public-key-signatures';
import type { LessonContent } from '../../types/lesson';

const defaults = { operation: OPERATIONS[0]!, p: '61', q: '53', e: '17', number: '65', message: 'pay bob 100', tamper: TAMPER[0]! };
const steps = publicKeySignaturesSteps(defaults);
const beforeEncrypt = steps[steps.findIndex((s) => s.title.startsWith('Encrypt:')) - 1]!;

const content: LessonContent = {
  overview:
    'Public-key cryptography gives each person two linked keys: a public one anyone may hold and a private one nobody else ever sees. What one key does, only the other can undo. This lesson builds an RSA key pair from two small primes, encrypts a number with it, and signs a message so that any change can be detected.',
  concept: [
    'With symmetric keys, everyone who can decrypt can also encrypt. Public-key cryptography splits those powers. Anyone can use your public key, but only you can use the private one.',
    'RSA is built on factoring. Multiplying two primes is easy, but getting them back from the product is very hard when it is large. The private exponent d can only be computed from those primes.',
    'Used one way round, this gives encryption: anyone encrypts with the public key, and only the private key decrypts. Used the other way round, it gives signatures: only the private key can sign, and anyone can check with the public key. Because a signature proves who made it, it fills the gap Diffie-Hellman left.',
    'A signature covers the hash of a message, so any change to the message breaks it. Unlike an HMAC tag, it proves authorship to anyone, because only one party holds the private key.',
    'The math here is real RSA, but these keys are tiny and a computer factors them instantly. Plain RSA is also unsafe without padding. In production, use Ed25519 or ECDSA signatures, or RSA of at least 2048 bits with OAEP for encryption and PSS for signatures, from a vetted library. Key exchange normally replaces RSA encryption altogether.',
  ],
  howItWorks: [
    'Two primes p and q are multiplied to make n, which is public.',
    'φ(n) comes from p and q, and the public exponent e is chosen to share no factor with it.',
    'Extended Euclid finds d, the inverse of e. This is the private key.',
    'Encrypting is m^e mod n, and decrypting is c^d mod n.',
    'Signing is hash^d mod n, and verifying checks that signature^e mod n equals the hash.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'operation', label: 'Operation', type: 'choice', sample: defaults.operation, options: OPERATIONS, help: 'Encrypt a number, or sign a message.' },
      { name: 'p', label: 'Prime p', type: 'number', sample: defaults.p, help: `A prime from ${PRIME_RANGE.min} to ${PRIME_RANGE.max}.` },
      { name: 'q', label: 'Prime q', type: 'number', sample: defaults.q, help: `A different prime from ${PRIME_RANGE.min} to ${PRIME_RANGE.max}.` },
      { name: 'e', label: 'Public exponent e', type: 'number', sample: defaults.e, help: `${EXPONENT_RANGE.min} to ${EXPONENT_RANGE.max}, sharing no factor with φ(n).` },
      { name: 'number', label: 'Number to encrypt', type: 'number', sample: defaults.number, help: 'From 0 to n − 1.' },
      { name: 'message', label: 'Message to sign', type: 'text', sample: defaults.message, help: `Up to ${MAX_MESSAGE} bytes.` },
      { name: 'tamper', label: 'Tamper with the message', type: 'choice', sample: defaults.tamper, options: TAMPER, help: 'When signing, an attacker adds ! to the message.' },
    ],
    presets: [
      { label: '61 × 53', values: defaults },
      { label: 'Sign a message', values: { ...defaults, operation: OPERATIONS[1]! } },
      { label: 'Tampered message', values: { ...defaults, operation: OPERATIONS[1]!, tamper: TAMPER[1]! } },
    ],
    generate: publicKeySignaturesSteps,
    codeLabel: 'Pseudocode',
  },
  code: publicKeySignaturesCode,
  prosCons: {
    pros: ['No shared secret is needed beforehand', 'A signature can be checked by anyone', 'Signatures prove who made them, so the signer can\'t deny it'],
    cons: ['Much slower than symmetric encryption', 'Keys and signatures are larger', 'You still have to know a public key really belongs to its owner'],
    useWhen: ['Proving who wrote or released something', 'Authenticating a key exchange', 'Letting anyone verify without being able to forge'],
    avoidWhen: ['Encrypting bulk data: agree on a symmetric key instead', 'Only your own services need to check: an HMAC is simpler'],
  },
  applications: [
    'TLS certificates and handshakes are signed',
    'Software updates and app stores check a publisher\'s signature',
    'Git commits and SSH logins can use signatures',
  ],
  commonMistakes: [
    'Using textbook RSA with no padding: it is deterministic and can be forged.',
    'Confusing the keys: encrypt with the public key, sign with the private one.',
    'Trusting a public key just because it arrived: an attacker can hand you their own.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The key is ready: n = 3233, e = 17, d = 2753. Which key encrypts the number 65?',
      view: beforeEncrypt.view,
      options: ['The public key: 65^17 mod 3233', 'The private key: 65^2753 mod 3233', 'φ(n): 65^3120 mod 3233', 'Both keys, one after the other'],
      answer: 0,
      explanation: 'Anyone can encrypt with n and e, which gives 2790. Only the holder of d can turn 2790 back into 65.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What would let an attacker compute the private key from the public key?',
      options: ['Factoring n into p and q', 'Knowing e', 'Encrypting many numbers', 'Seeing one signature'],
      answer: 0,
      explanation: 'd comes from φ(n), which needs p and q. With tiny numbers that is instant; at 2048 bits it is out of reach.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why can anyone verify this signature but only one party make it?',
      code: 'function sign(message) { return hash(message) ^ d mod n }\nfunction verify(message, s) { return s ^ e mod n == hash(message) }',
      options: ['Signing needs the private d; verifying needs only the public e', 'hash() is secret', 'n is secret', 'verify() can only run once'],
      answer: 0,
      explanation: 'Only the holder of d can produce a value that e turns back into the hash.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does real RSA encryption add random padding?',
      options: ['Without it, the same message always gives the same ciphertext', 'To make the key shorter', 'To remove the need for a private key', 'To speed up decryption'],
      answer: 0,
      explanation: 'Textbook RSA is deterministic, so an attacker can encrypt guesses and compare them. OAEP adds randomness to prevent that.',
    },
  ],
  summary: [
    'A key pair splits powers: the public key can be shared, and the private key never is.',
    'RSA relies on factoring being hard; d can only be computed from p and q.',
    'Encrypt with the public key, and sign with the private key.',
    'A signature proves who made a message and that it hasn\'t changed.',
  ],
};

export default content;
