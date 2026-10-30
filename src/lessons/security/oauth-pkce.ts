import { ATTACK_OPTIONS, oauthPkceCode, oauthPkceSteps } from '../../security/scenarios/oauth-pkce';
import { DEFENSE_OPTIONS } from '../../security/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[0]! };
const approved = oauthPkceSteps({ attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[1]! })[2]!;

const content: LessonContent = {
  overview:
    '"Sign in with..." lets an app use an account it never sees the password for. OAuth 2.0 is how that works: a provider sends a short-lived code through your browser, and the app trades it for tokens. Three small checks hold that flow together, and this lesson removes each one to show what breaks.',
  concept: [
    'Three parties take part. The browser carries messages, the app (shop.example) wants to know who you are, and the provider (login.example) holds your account. The app sends you to the provider, you sign in there, and the provider sends you back with a code.',
    'A code on its own is risky, because it travels through the browser, where logs and other software can see it. PKCE ties it to the app that asked. The app makes a random verifier, sends its SHA-256 hash as the code_challenge, and later reveals the verifier to redeem the code. Seeing the hash does not help, because SHA-256 can\'t be reversed.',
    'state ties the callback to the browser that started the flow. Without it, an attacker can get a code for their own account and push it into your browser, leaving you signed in as them. You then save your card into their account. This is login CSRF.',
    'The provider must compare the redirect address exactly. A check that only looks at the start lets https://shop.example.evil.example through, and the code lands on the attacker\'s server.',
    'The hashes and checks here are real, and the challenge matches RFC 7636. OAuth has much more than this flow. In production, use a certified library or your provider\'s SDK, use the authorization code flow with PKCE for every client, register exact redirect addresses, and keep tokens away from page scripts.',
  ],
  howItWorks: [
    'The shop makes a state and a verifier, then redirects to login.example with the hash of the verifier.',
    'alice signs in at login.example, and it redirects back with a code.',
    'The shop checks state, then posts the code and verifier to /token.',
    'The provider hashes the verifier and compares it with the stored challenge.',
    'The provider returns tokens, and the shop signs alice in.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'Which step of the flow the attacker goes after.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'Turns on the one control that stops this attack.' },
    ],
    presets: ATTACK_OPTIONS.map((attack) => ({ label: attack, values: { ...defaults, attack } })),
    generate: oauthPkceSteps,
    codeLabel: 'Pseudocode',
  },
  code: oauthPkceCode,
  prosCons: {
    pros: ['The app never sees the password', 'One account works across many apps', 'Access can be limited and revoked per app'],
    cons: ['Several redirects, each one a place to go wrong', 'Depends on the provider being up', 'Easy to get subtly wrong without a library'],
    useWhen: ['Users sign in with an existing account', 'An app needs limited access to a user\'s data elsewhere'],
    avoidWhen: ['A first-party site with its own accounts and no other apps: a session may be simpler'],
  },
  applications: [
    '"Sign in with Google" and "Sign in with GitHub" buttons',
    'A calendar app reading your events with your permission',
    'Mobile apps, where PKCE first became required',
  ],
  commonMistakes: [
    'Leaving out state, or generating it but never checking it.',
    'Allowing wildcard or prefix-matched redirect addresses.',
    'Skipping PKCE because the app is on a server: it protects those flows too.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This flow uses PKCE, and the attacker has copied the code. What does /token answer when the attacker sends it with no verifier?',
      view: approved.view,
      options: ['400: the verifier does not match', '200: the code is valid', '401: wrong password', '302: back to the shop'],
      answer: 0,
      explanation: 'The provider hashes the verifier and compares it with the stored challenge. The attacker can\'t produce a verifier that matches.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why is it safe for the code_challenge to pass through the browser?',
      options: ['It is a hash, so the verifier can\'t be worked out from it', 'It is encrypted', 'It expires after one second', 'Browsers hide URLs'],
      answer: 0,
      explanation: 'Only the app holds the verifier. The hash proves the app knows it when it reveals it later.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this check stop?',
      code: 'if (checkState && state != remembered.state) return 400',
      options: ['A callback this browser did not start', 'A wrong password', 'An expired token', 'A slow provider'],
      answer: 0,
      explanation: 'An attacker\'s link can\'t carry the state stored for this browser, so login CSRF fails.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'The attacker writes a whole sign-in link, including a code_challenge. Does PKCE stop a tampered redirect?',
      options: ['No: the attacker holds the matching verifier, so exact redirect matching has to stop it', 'Yes: PKCE blocks all attacks on the code', 'Yes: the challenge is signed', 'No: PKCE only works on mobile'],
      answer: 0,
      explanation: 'PKCE ties a code to whoever started the flow. Here the attacker started it, so the redirect check does the work.',
    },
  ],
  summary: [
    'The app gets a short-lived code through the browser, then trades it for tokens.',
    'PKCE ties the code to the app that asked.',
    'state ties the callback to the browser that started it.',
    'Exact redirect matching keeps the code away from look-alike addresses.',
  ],
};

export default content;
