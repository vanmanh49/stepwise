import { ATTACK_OPTIONS, openidConnectCode, openidConnectSteps } from '../../security/scenarios/openid-connect';
import { DEFENSE_OPTIONS } from '../../security/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[0]! };
const handed = openidConnectSteps({ attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[1]! }).at(-2)!;

const content: LessonContent = {
  overview:
    'OAuth was built to give apps access, not to prove who signed in. OpenID Connect adds that proof: a signed ID token from the provider. A token that is real can still be the wrong token, so this lesson hands the shop three real ID tokens and one access token, and shows which check catches each.',
  concept: [
    'An ID token is a JWT signed by the provider. Each claim answers one question. iss says who issued it, sub says who the user is, aud says which app it is for, nonce ties it to one sign-in, and exp says when it stops counting.',
    'The app checks the signature with the provider\'s public key, published at a jwks address. That is why providers use asymmetric signatures: many apps can verify, and only the provider can sign. An HMAC secret would have to be shared with every app, and any one of them could then forge tokens.',
    'A valid signature only proves the provider said it. It does not prove the token was meant for you. An app the attacker runs can get a perfectly real token for a user, so skipping aud lets any app sign in as anyone who used it.',
    'An access token is not proof of sign-in. It is a key that says its holder may do something, and it may have been issued to a different app. Only an ID token says who signed in, and where.',
    'The claim checks here are real, but the signature is a toy RSA key small enough to read, labelled TOY-RS. In production, use a certified OpenID Connect library, sign with RS256 or ES256 at full key size, fetch keys from the provider\'s jwks address, and check iss, aud, exp and nonce on every token.',
  ],
  howItWorks: [
    'The sign-in runs like OAuth, with a nonce added to the first redirect.',
    'The provider returns an ID token along with the access token.',
    'The app fetches the provider\'s public key and checks the signature and iss.',
    'It checks aud, nonce and exp, each against what it expects.',
    'Only then does it sign in the user named by sub.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'Which token the attacker hands to the shop.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'Turns on the one control that stops this attack.' },
    ],
    presets: ATTACK_OPTIONS.map((attack) => ({ label: attack, values: { ...defaults, attack } })),
    generate: openidConnectSteps,
    codeLabel: 'Pseudocode',
  },
  code: openidConnectCode,
  prosCons: {
    pros: ['A standard way to learn who signed in', 'Any app can verify a token without calling the provider', 'Apps never handle passwords'],
    cons: ['Every claim must be checked, and a missed one is silent', 'Tokens can\'t be recalled before exp', 'Depends on the provider\'s keys and uptime'],
    useWhen: ['Users sign in with an account from another provider', 'A company gives many internal apps one sign-in'],
    avoidWhen: ['An app only needs access to an API, with no need to know who signed in'],
  },
  applications: [
    '"Sign in with Google" returns an OpenID Connect ID token',
    'Company single sign-on through providers such as Okta and Entra ID',
    'CI systems prove their identity to cloud providers with ID tokens',
  ],
  commonMistakes: [
    'Checking the signature and skipping aud.',
    'Treating an access token, or a /userinfo response for one, as proof of sign-in.',
    'Reading claims from a token without verifying it first.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'evil-app got this real ID token for alice, and the attacker hands it to the shop. The shop checks aud. What happens?',
      view: handed.view,
      options: ['401: aud is evil-app, not shop', '200: the signature is real', '401: the signature is wrong', '200: the nonce matches'],
      answer: 0,
      explanation: 'The signature and nonce pass, but the token was made for another app. aud is the check that notices.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why do providers sign ID tokens with a private key rather than a shared HMAC secret?',
      options: ['Many apps can verify, and none of them can forge a token', 'Private keys are faster', 'HMAC can\'t sign JSON', 'It makes tokens shorter'],
      answer: 0,
      explanation: 'With a shared secret, every app that can verify could also sign, so one bad app could impersonate anyone.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this check prove?',
      code: 'if (checkNonce && token.nonce != flow.nonce) return 401',
      options: ['The token came from the sign-in this app started', 'The user\'s password is right', 'The provider is online', 'The token is for this app'],
      answer: 0,
      explanation: 'The app makes a nonce for each sign-in, so a token from an earlier sign-in carries the wrong value.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why is an access token not proof that alice signed in to the shop?',
      options: ['It may have been issued to another app, and it says nothing about who it is for', 'Access tokens are unsigned', 'Access tokens expire too quickly', 'Only admins can use them'],
      answer: 0,
      explanation: 'Any app alice used holds one. If the shop accepts it, any of those apps can sign in as alice.',
    },
  ],
  summary: [
    'An ID token is the provider\'s signed statement of who signed in.',
    'The signature proves who said it. The claims prove it is for this app and this sign-in.',
    'Check iss, aud, nonce and exp every time.',
    'An access token is a key, not proof of sign-in.',
  ],
};

export default content;
