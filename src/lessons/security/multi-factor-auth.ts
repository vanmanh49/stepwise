import { ATTACK_OPTIONS, multiFactorAuthCode, multiFactorAuthSteps } from '../../security/scenarios/multi-factor-auth';
import { DEFENSE_OPTIONS } from '../../security/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[0]! };
const relayed = multiFactorAuthSteps({ attack: ATTACK_OPTIONS[2]!, defense: DEFENSE_OPTIONS[0]! }).at(-2)!;

const content: LessonContent = {
  overview:
    'A stolen password should not be enough to get in. Multi-factor auth asks for a second proof, usually a code from your phone or a passkey. This lesson works out real time-based codes, then shows the attack codes stop, the attack they stop only if used once, and the attack only a passkey stops.',
  concept: [
    'A factor is a kind of proof: something you know, such as a password, or something you have, such as a phone. Two proofs of the same kind add little. A second kind means a stolen password alone is no use.',
    'A TOTP code comes from a secret shared once, usually through a QR code, and from the clock. Both sides take the time, divide by 30 to get a step number, and run HMAC on it with the secret. Six digits read from the result are the code. No network is involved, which is why it works offline.',
    'Clocks drift, so servers accept one step either side. That means a code stays usable for a while, so it must also be marked as used, or someone who sees it can type it again.',
    'A typed code can be phished. A fake page asks for the code and passes it to the real site in seconds, while it is still fresh. A passkey fixes that: the browser asks it to sign a challenge together with the real origin, and it refuses to sign for any site it was not made for.',
    'The TOTP here is real and matches RFC 6238, though it uses SHA-256 where most apps use SHA-1. The passkey is simulated with a toy RSA key and shows the origin check, not the WebAuthn format. In production, use a tested WebAuthn or TOTP library, rate limit code entry, and give users recovery codes, because recovery is a common way around MFA.',
  ],
  howItWorks: [
    'The password is checked first, and it opens only a half-signed-in session.',
    'The second step is a code worked out from the shared secret and the clock, or a passkey signature.',
    'Only then does the session reach the full level the account page needs.',
    'A replay is stopped by remembering used codes.',
    'A relay is stopped by a signature that names the real origin.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'What the attacker already has.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'Turns on the one control that stops this attack.' },
    ],
    presets: ATTACK_OPTIONS.map((attack) => ({ label: attack, values: { ...defaults, attack } })),
    generate: multiFactorAuthSteps,
    codeLabel: 'Pseudocode',
  },
  code: multiFactorAuthCode,
  prosCons: {
    pros: ['A leaked password alone no longer signs anyone in', 'TOTP works offline with a free app', 'Passkeys can\'t be phished'],
    cons: ['A lost phone needs a recovery path, which attackers target', 'Typed codes can be relayed live', 'More steps at sign-in'],
    useWhen: ['Any account worth taking over', 'Admin and money-moving actions'],
    avoidWhen: ['SMS as the only second factor where a phone number can be hijacked'],
  },
  applications: [
    'Authenticator apps show a new TOTP code every 30 seconds',
    'Passkeys sign you in with a fingerprint or face check',
    'Hardware security keys protect staff accounts at large companies',
  ],
  commonMistakes: [
    'Forgetting to limit tries on the code route, so all million codes can be tried.',
    'Accepting the same code twice inside its window.',
    'Treating a typed code as phishing-proof.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'alice typed a password and a live code into evil.example, which passed both to the real shop. What does the attacker get at /account?',
      view: relayed.view,
      options: ['alice\'s account: the code was valid', '401: the code came from the wrong site', '403: the shop saw the fake page', 'Nothing: codes can\'t cross the network'],
      answer: 0,
      explanation: 'The shop only sees a right code, in time. Nothing in a typed code says which page it was typed into.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What do the phone and the server share to make the same code?',
      options: ['A secret and the time', 'A network connection', 'The password', 'A list of future codes'],
      answer: 0,
      explanation: 'Both run HMAC over the current 30 s step with the shared secret, with no connection between them.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this check stop?',
      code: 'if (oneTime && used.has(code)) return 401',
      options: ['Someone typing a code they saw a moment ago', 'A wrong password', 'A fake sign-in page', 'A phone with the wrong time'],
      answer: 0,
      explanation: 'A code stays valid for up to a minute or so. Marking it used closes that window.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why can\'t evil.example relay a passkey sign-in?',
      options: ['The browser only signs for the origin the passkey belongs to', 'Passkeys are longer than codes', 'The shop blocks evil.example\'s address', 'alice would notice the page'],
      answer: 0,
      explanation: 'The check runs in the browser and needs no attention from the person, so a convincing page changes nothing.',
    },
  ],
  summary: [
    'A second factor makes a stolen password useless on its own.',
    'TOTP codes come from a shared secret and the clock.',
    'Mark codes as used, or they can be replayed inside their window.',
    'Typed codes can be phished. Passkeys are tied to the real origin.',
  ],
};

export default content;
