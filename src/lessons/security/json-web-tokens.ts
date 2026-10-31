import { ATTACK_OPTIONS, jsonWebTokensCode, jsonWebTokensSteps } from '../../security/scenarios/json-web-tokens';
import { DEFENSE_OPTIONS } from '../../security/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[0]! };
const edited = jsonWebTokensSteps({ attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[1]! }).at(-2)!;

const content: LessonContent = {
  overview:
    'A JSON Web Token (JWT) puts the facts about a user in a signed token, so a server can trust them without looking anything up. That is useful, and easy to get wrong. This lesson signs real HS256 tokens and attacks them four ways.',
  concept: [
    'A JWT has three parts joined by dots: a header, a payload and a signature. The header names the algorithm and the payload holds claims such as sub (the user), role and exp (when it ends). Both are base64url, which anyone can decode. They are signed, not encrypted.',
    'With HS256, the signature is an HMAC of the header and payload, using a secret only the servers know. Change one letter of the payload and the signature no longer matches. So the signature is the whole point, and a server that skips it trusts text the user can edit.',
    'The header is part of what the attacker sends, so a server must not let it choose how the token gets checked. The classic flaw is "alg": "none", where the token says it needs no signature and the library agrees.',
    'A token can\'t be recalled. A session row can be deleted the moment a user signs out, but a token stays valid until its exp. That is why access tokens live for minutes.',
    'The HMAC here is real and matches published test values. In production, use a maintained JWT library, pin the algorithm in your code, use a random secret of at least 32 bytes or an asymmetric key, keep expiry short, and keep a session when you need instant sign-out.',
  ],
  howItWorks: [
    'alice signs in, and the shop signs a token holding alice\'s name, role and expiry.',
    'Each later request carries the token. The shop stores nothing.',
    'The shop decodes the token and checks the algorithm, the signature and the expiry.',
    'The attacker changes the token or finds the secret, then calls /admin.',
    'If every check passes, the shop believes the payload.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'How the attacker abuses the token.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'Turns on the one control that stops this attack.' },
    ],
    presets: ATTACK_OPTIONS.map((attack) => ({ label: attack, values: { ...defaults, attack } })),
    generate: jsonWebTokensSteps,
    codeLabel: 'Pseudocode',
  },
  code: jsonWebTokensCode,
  prosCons: {
    pros: ['Servers check it with no database lookup', 'Works across services that share a key', 'Carries claims with it'],
    cons: ['Can\'t be recalled before it expires', 'Anyone can read the payload', 'A leaked secret lets anyone mint any token'],
    useWhen: ['Short-lived access between services', 'An identity provider tells many apps who signed in'],
    avoidWhen: ['A website only needs a session cookie', 'You must be able to end a session at once'],
  },
  applications: [
    'OpenID Connect ID tokens are JWTs',
    'APIs accept short-lived JWT access tokens',
    'Kubernetes service accounts authenticate with signed JWTs',
  ],
  commonMistakes: [
    'Decoding a token and trusting it without verifying the signature.',
    'Letting the token\'s own header pick the verification algorithm.',
    'Signing with a short or guessable secret, which an attacker can test offline.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The attacker changed role to admin and kept the old signature. This shop verifies signatures. What happens at /admin?',
      view: edited.view,
      options: ['401: the signature does not match', '200: the role says admin', '403: alice is a customer', '404: no such page'],
      answer: 0,
      explanation: 'The signature covers the original payload, so the recomputed value differs and the token is refused.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Who can read the payload of a JWT?',
      options: ['Anyone holding the token', 'Only servers with the secret', 'Only the user it names', 'Nobody: it is encrypted'],
      answer: 0,
      explanation: 'The payload is base64url text. Signing protects it from changes, not from being read, so never put secrets in it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What makes this line dangerous?',
      code: "if (header.alg == 'none') return payload",
      options: ['The attacker writes the header, so the attacker turns the check off', 'none is a slow algorithm, which helps guessing attacks', 'It rejects valid tokens, which locks real users out', 'Headers can\'t be read'],
      answer: 0,
      explanation: 'The token decides how it gets checked. Pin the algorithm in the server\'s code instead.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'alice signs out, but a stolen token has an hour left. What can the shop do with plain JWTs?',
      options: ['Nothing: it stays valid until exp', 'Delete its session row', 'Change alice\'s password to end it', 'Ask the browser to delete the stolen copy'],
      answer: 0,
      explanation: 'No server state means nothing to delete. Short expiry limits the damage, or a block list brings the lookup back.',
    },
  ],
  summary: [
    'A JWT is a signed payload anyone can read.',
    'The signature is the point, so always verify it.',
    'Fix the algorithm on the server, and use a strong secret.',
    'A token can\'t be recalled, so keep expiry short.',
  ],
};

export default content;
