import { MAX_EXTENSION, MAX_KEY, MAX_MESSAGE, messageAuthenticationCode, messageAuthenticationSteps, SCHEMES } from '../../security/scenarios/message-authentication';
import type { LessonContent } from '../../types/lesson';

const defaults = { scheme: SCHEMES[0]!, key: 'secret-key', message: 'amount=100&to=alice', extension: '&to=mallory' };
const beforeVerdict = messageAuthenticationSteps(defaults).at(-2)!;

const content: LessonContent = {
  overview:
    'A hash tells you data has not changed, but anyone can compute one. A message authentication code (MAC) adds a shared secret key, so only someone with the key can make a valid tag. This lesson shows why the obvious way to do that fails, by forging a tag without the key, and how HMAC stops the same attack.',
  concept: [
    'A MAC is a short tag computed from a message and a secret key. The receiver recomputes the tag with the same key and compares. A match shows the message was not changed and came from someone who holds the key.',
    'The obvious design is SHA-256(key + message). It looks safe but it is not. A SHA-256 digest is the hash\'s complete internal state, so an attacker can restart the hash from a tag and keep going. The result is a valid tag for the message plus some padding plus extra bytes of the attacker\'s choice. This is a length-extension attack.',
    'HMAC hashes twice. The inner hash covers the key and the message. The outer hash covers the key again and the inner result. Extending the tag now extends the wrong hash, so the forgery fails.',
    'The SHA-256 and HMAC here are real and match Node\'s crypto module. In production, use HMAC-SHA-256 from your platform\'s library, and compare tags in constant time so an attacker can\'t learn them byte by byte from response times. AES-GCM, in a later lesson, combines this protection with encryption.',
  ],
  howItWorks: [
    'The server computes a tag from its secret key and the message, and sends both.',
    'The attacker sees the message and tag, and knows or guesses the length of the key.',
    'The attacker works out the padding that SHA-256 added, then appends their own text after it.',
    'Resuming SHA-256 from the tag gives a new tag for the longer message.',
    'The server recomputes the tag. The naive scheme matches and accepts; HMAC does not match and rejects.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scheme', label: 'Scheme', type: 'choice', sample: defaults.scheme, options: SCHEMES, help: 'How the server makes its tag.' },
      { name: 'key', label: 'Secret key', type: 'text', sample: defaults.key, help: `1 to ${MAX_KEY} bytes. The attacker never sees it.` },
      { name: 'message', label: 'Message', type: 'text', sample: defaults.message, help: `1 to ${MAX_MESSAGE} bytes.` },
      { name: 'extension', label: 'Attacker\'s extension', type: 'text', sample: defaults.extension, help: `1 to ${MAX_EXTENSION} bytes added by the attacker.` },
    ],
    presets: [
      { label: 'Forge the naive tag', values: defaults },
      { label: 'Same forgery on HMAC', values: { ...defaults, scheme: SCHEMES[1]! } },
    ],
    generate: messageAuthenticationSteps,
    codeLabel: 'Pseudocode',
  },
  code: messageAuthenticationCode,
  prosCons: {
    pros: ['Detects any change to a message', 'Proves the sender holds the shared key', 'Fast, and needs only a hash function'],
    cons: ['Both sides need the same secret key, so getting it to them is a separate problem', 'Either side could have made the tag, so a MAC can\'t prove to a third party who wrote it', 'Does not hide the message'],
    useWhen: ['Your own services need to trust each other\'s messages', 'Signing webhooks, cookies and API requests with a shared secret'],
    avoidWhen: ['A third party must verify who wrote something: use a digital signature', 'The message must stay secret: use authenticated encryption'],
  },
  applications: [
    'Webhook providers sign each delivery with HMAC-SHA-256',
    'Signed cookies and JSON Web Tokens with the HS256 algorithm',
    'TOTP codes in authenticator apps are built from HMAC',
  ],
  commonMistakes: [
    'Building a MAC as hash(key + message): SHA-256 and SHA-512 allow length extension.',
    'Comparing tags with ==, which can stop at the first wrong byte and leak timing.',
    'Assuming a tag keeps the message secret: it only protects it from being changed.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The attacker has built a forged message and tag against SHA-256(key + message), without knowing the key. What does the server do?',
      view: beforeVerdict.view,
      options: ['Accepts it: the tag matches', 'Rejects it: the tag is wrong', 'Rejects it: the message is too long', 'Asks the attacker for the key'],
      answer: 0,
      explanation: 'Hashing key + forged message reaches exactly the state the attacker resumed from, so the tags match.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why can an attacker continue a SHA-256 hash from a digest?',
      options: ['The digest is the hash\'s whole internal state', 'SHA-256 stores the key in the digest', 'The digest is encrypted with a weak key', 'SHA-256 is reversible'],
      answer: 0,
      explanation: 'After the last block, the eight registers are simply written out as the digest. Reading them back restores the state.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What stops length extension in HMAC?',
      code: 'inner = sha256((key ^ ipad) + message)\nreturn sha256((key ^ opad) + inner)',
      options: ['The tag is an outer hash over the inner result, so resuming it extends the wrong hash', "The key is longer than the block, so the length can't be guessed", 'The message is encrypted first', 'SHA-256 runs twice as many rounds, so the state is too mixed to resume'],
      answer: 0,
      explanation: 'An attacker who resumes from the tag extends the outer hash, which the server never computes that way.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Alice and Bob share an HMAC key. Bob shows a judge a message with a valid tag. What does this prove?',
      options: ['Nothing about which of them wrote it', 'Alice wrote it', 'Bob wrote it', 'Nobody changed the key'],
      answer: 0,
      explanation: 'Both hold the key, so either could have made the tag. Proving authorship to a third party takes a digital signature.',
    },
  ],
  summary: [
    'A MAC is a tag only key holders can make, showing a message is unchanged.',
    'SHA-256(key + message) can be extended by an attacker who never sees the key.',
    'HMAC hashes twice, so the tag can\'t be extended.',
    'Both sides share the key, so a MAC can\'t prove which of them wrote a message.',
  ],
};

export default content;
