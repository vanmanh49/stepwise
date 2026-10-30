import { ATTACK_OPTIONS, credentialAttacksCode, credentialAttacksSteps, DEFENSES } from '../../security/scenarios/credential-attacks';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]!, defense: DEFENSES[0]! };
const fifthFailure = credentialAttacksSteps({ attack: ATTACK_OPTIONS[0]!, defense: DEFENSES[2]! })[5]!;

const content: LessonContent = {
  overview:
    'Attackers rarely break hashes first. They just try to sign in. This lesson runs three attacks against a real sign-in route, and shows that the limits which stop guessing do little against the two attacks used most often.',
  concept: [
    'Guessing tries many passwords on one account. It is the attack people imagine, and it is the easiest to notice. A limit per address slows it to a few tries a minute. A lockout per account ends it, at a cost.',
    'Credential stuffing replays name and password pairs leaked from other sites. People reuse passwords, so some pairs work. Each account gets one try, from a new address each time, so neither limit fires.',
    'Password spraying tries one common password across many accounts. One address makes a few tries, and each account sees a single failure, so again nothing fires.',
    'Limits have a cost too. A lockout lets anyone who knows a name lock that user out, and shared addresses mean a per-IP limit can hit innocent people.',
    'The attacks here run against a simulated shop in this page, with a tiny list. In production, combine rate limits with multi-factor sign-in, check new passwords against lists of breached ones, and watch for many failures across accounts.',
  ],
  howItWorks: [
    'The attacker sends sign-in requests, each on the simulated clock.',
    'The shop checks its limit first, so a limited request never reaches the password check.',
    'A wrong password adds one failure to that account.',
    'A right password gives a session, which works like anyone else\'s.',
    'The last step shows who got in and which limit, if any, fired.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'What the attacker tries.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSES, help: '5 tries per address per minute, or a lock after 5 failures.' },
    ],
    presets: [
      { label: 'Guessing', values: defaults },
      { label: 'Stuffing', values: { ...defaults, attack: ATTACK_OPTIONS[1]! } },
      { label: 'Spraying', values: { ...defaults, attack: ATTACK_OPTIONS[2]! } },
      { label: 'Lock alice out', values: { attack: ATTACK_OPTIONS[0]!, defense: DEFENSES[2]! } },
    ],
    generate: credentialAttacksSteps,
    codeLabel: 'Pseudocode',
  },
  code: credentialAttacksCode,
  prosCons: {
    pros: ['Limits slow online guessing cheaply', 'They need no change for users', 'A limited request costs no password hash'],
    cons: ['Neither limit sees stuffing or spraying', 'Lockout lets anyone lock a user out', 'Per-IP limits hit people who share an address'],
    useWhen: ['Every sign-in, password reset and code entry route should have a limit'],
    avoidWhen: ['Long, permanent lockouts: use a short lock or a growing delay'],
  },
  applications: [
    'Sign-in pages rate limit by address and by account',
    'Breach lists such as Have I Been Pwned refuse known passwords at sign-up',
    'Security teams alert on many failures spread across many accounts',
  ],
  commonMistakes: [
    'Saying "wrong password" for a real name and "no such user" otherwise, which tells attackers who has an account.',
    'Limiting the sign-in page but not password reset or the API behind it.',
    'Trusting a client-supplied header for the address, which an attacker can set to anything.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The shop locks an account after 5 failures. The attacker\'s next try on alice is the right password, sunshine. What does the shop answer?',
      view: fifthFailure.view,
      options: ['423: the account is locked', '200: the password is right', '401: wrong password', '429: too many tries from this address'],
      answer: 0,
      explanation: 'The lock is checked before the password, so even the right one is refused.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does a per-IP limit miss credential stuffing?',
      options: ['Each try comes from a new address', 'Stuffing uses no passwords', 'The shop can\'t read addresses', 'Stuffing only runs at night'],
      answer: 0,
      explanation: 'Attackers rent many addresses, so no single address passes the limit.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'An attacker tries 1 password on each of 1,000 accounts from one address, slowly. Which check fires?',
      code: 'if (limit == lockout && failures[name] >= 5) return 423',
      options: ['Neither: each account has one failure', 'It fires on the 5th account', 'It fires on every account', 'It fires only for real names'],
      answer: 0,
      explanation: 'The counter is per account, and each one sees a single failure. That is password spraying.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is the downside of locking an account after 5 failures?',
      options: ['Anyone who knows a name can lock that user out', 'It makes passwords easier to guess', 'It stores more passwords', 'It stops working over https'],
      answer: 0,
      explanation: 'The failures do not have to come from the owner, so the lock can be used against them.',
    },
  ],
  summary: [
    'Guessing hits one account many times. A limit slows it, and a lockout ends it at a cost.',
    'Stuffing replays leaked pairs, and spraying tries one password on many accounts.',
    'Neither looks like guessing, so per-IP limits and lockouts miss them.',
    'MFA and breached-password checks are what help against both.',
  ],
};

export default content;
