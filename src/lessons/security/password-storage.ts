import { MAX_PASSWORD, passwordStorageCode, passwordStorageSteps, STORAGE_OPTIONS } from '../../security/scenarios/password-storage';
import type { LessonContent } from '../../types/lesson';

const defaults = { storage: STORAGE_OPTIONS[1]!, password: 'tiger-lily-42' };
const leak = passwordStorageSteps(defaults)[1]!;

const content: LessonContent = {
  overview:
    'Sooner or later, a database leaks. What the attacker gets then depends on how the passwords were stored. This lesson leaks a real table four ways and runs a real attack on each, from plain text that needs no guesses to a slow, salted hash that makes every guess expensive.',
  concept: [
    'A shop never needs to know your password. It only needs to check that you typed the same one again. So it stores something it can compare against, and throws the password away.',
    'A plain hash is not enough. SHA-256 always gives the same output for the same input, so two users with one password have equal hashes, and the attacker only hashes each guess once. SHA-256 is also built to be fast, which helps the attacker.',
    'A salt is a random value stored next to the hash and mixed into it. It is not secret. It just makes every row different, so the attacker must search again for each user, and tables of pre-computed hashes stop working.',
    'A slow hash such as PBKDF2 repeats the work many times. One sign-in barely notices, but an attacker making billions of guesses does. No storage scheme saves a password that is in the attacker\'s list. Slowing the attacker down buys time, and a strong password is what wins it.',
    'The hashes here are real, and the PBKDF2 matches Node\'s crypto module. This page runs only 100 rounds to stay smooth on a phone, and the rates are rough. In production, use Argon2id, scrypt or bcrypt from your platform\'s library, or PBKDF2 with at least 600,000 rounds, and let the library handle the salt.',
  ],
  howItWorks: [
    'You sign in, and the shop compares what you typed against your row.',
    'The attacker copies the users table.',
    'Plain text is read directly. Hashes must be guessed.',
    'Without salt, each word in the list is hashed once and compared with every row.',
    'With salt, the attacker runs the whole list again for each user.',
    'The last step counts the guesses and estimates the time at real speed.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'storage', label: 'Storage', type: 'choice', sample: defaults.storage, options: STORAGE_OPTIONS, help: 'How the shop stores every password.' },
      { name: 'password', label: 'Your password', type: 'text', sample: defaults.password, help: `1 to ${MAX_PASSWORD} bytes. Try sunshine, which alice and bob use.` },
    ],
    presets: [
      { label: 'Plain text', values: { ...defaults, storage: STORAGE_OPTIONS[0]! } },
      { label: 'Equal hashes', values: defaults },
      { label: 'Salted', values: { ...defaults, storage: STORAGE_OPTIONS[2]! } },
      { label: 'Slow hash', values: { ...defaults, storage: STORAGE_OPTIONS[3]! } },
      { label: 'Weak password', values: { storage: STORAGE_OPTIONS[3]!, password: 'monkey' } },
    ],
    generate: passwordStorageSteps,
    codeLabel: 'Pseudocode',
  },
  code: passwordStorageCode,
  prosCons: {
    pros: ['A leak no longer hands over passwords directly', 'Salts force a separate search for each user', 'Slow hashes make each guess expensive'],
    cons: ['A password in the attacker\'s list still falls, just later', 'Slow hashes cost the server CPU on every sign-in', 'The work setting needs raising as hardware gets faster'],
    useWhen: ['Your app checks passwords itself'],
    avoidWhen: ['You can sign users in through a trusted identity provider and store no passwords at all'],
  },
  applications: [
    'Web frameworks hash passwords with bcrypt, scrypt or Argon2 by default',
    'Password managers stretch the master password with PBKDF2 or Argon2',
    'Breach checkers warn when a password is already in a leaked list',
  ],
  commonMistakes: [
    'Storing passwords with SHA-256 or MD5: both are built to be fast.',
    'Using one salt for every user, which brings back equal hashes for equal passwords.',
    'Encrypting passwords instead of hashing them: whoever gets the key gets them all.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The attacker has this table of plain SHA-256 hashes. How many words must the attacker hash to crack both alice and bob?',
      view: leak.view,
      options: ['One word: their hashes are equal', 'Two words: one per user', 'All 12 words, twice', 'None: SHA-256 can be reversed'],
      answer: 0,
      explanation: 'Equal hashes mean equal passwords, and with no salt the same guess matches both rows.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why is it fine to store a salt next to the hash, where the attacker can read it?',
      options: ['A salt only has to be different for each user, not secret', 'The salt is encrypted', 'The attacker can\'t tell which column is the salt', 'It isn\'t fine: salts must be kept secret'],
      answer: 0,
      explanation: 'The salt stops equal passwords looking equal and forces a separate search for each user. It still works when the attacker can read it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does raising `rounds` change for the attacker?',
      code: 'hash = pbkdf2(password, salt, rounds)',
      options: ['Each guess costs that many more hashes', 'The attacker needs a longer wordlist', 'Passwords in the list can no longer be cracked', 'The salt becomes secret'],
      answer: 0,
      explanation: 'Each guess must run every round, so 100 rounds costs 100 times as much. The same words are still found, only later.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A shop uses PBKDF2 with a good salt, and your password is "monkey". The table leaks. What happens?',
      options: ['It is cracked: "monkey" is in the list, and only costs more guesses to reach', 'It is safe: PBKDF2 can\'t be guessed', 'It is safe: the salt hides it', 'The attacker must break SHA-256 first'],
      answer: 0,
      explanation: 'Storage slows guessing down. It can\'t stop a guess that is right, so a common password still falls.',
    },
  ],
  summary: [
    'Store something you can compare against, never the password itself.',
    'Salts make equal passwords look different and force one search per user.',
    'Slow hashes multiply the cost of every guess.',
    'A password in the attacker\'s list falls under every scheme. Strength still matters.',
  ],
};

export default content;
