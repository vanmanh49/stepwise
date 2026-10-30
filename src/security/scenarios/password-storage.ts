import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY, readBytes } from '../steps';
import { USERS, WORDLIST } from '../web/data';
import { createShop, hashPassword, ROUNDS, saltFor, SHOP_ORIGIN, type Storage } from '../web/shop';
import { createStory, resultOf, rowsGrid } from '../web/story';
import { createWorld } from '../web/world';

export const passwordStorageCode = `function store(password, scheme) {
  if (scheme == plain) return password
  if (scheme == sha256) return sha256(password)
  salt = randomBytes()                         // different for every user
  if (scheme == salted) return sha256(salt + password)
  return pbkdf2(password, salt, rounds)        // slow on purpose
}

function crack(row, wordlist) {
  for (word of wordlist) {
    guess = store(word, row.scheme, row.salt)  // one guess
    if (guess == row.hash) return word
  }
  return null                                  // not in the list
}`;

export const STORAGE_OPTIONS = ['Plain text', 'SHA-256', 'Salted SHA-256', 'PBKDF2'];
export const MAX_PASSWORD = 32;

const SCHEMES: Record<string, Storage> = { 'Plain text': 'plain', 'SHA-256': 'sha256', 'Salted SHA-256': 'salted', PBKDF2: 'pbkdf2' };

const YOU = 'you';
const TITLE = 'Cannot run this password';
const LIST_SIZE = 1_000_000_000;
/** One GPU, roughly. PBKDF2's rate is at the 600,000 rounds current advice asks for. */
const FAST_RATE = 10_000_000_000;
const SLOW_RATE = 8000;

const STORE_LINE: Record<Storage, string> = {
  plain: 'if (scheme == plain)',
  sha256: 'if (scheme == sha256)',
  salted: 'if (scheme == salted)',
  pbkdf2: 'return pbkdf2(',
};

const STORE_WHY: Record<Storage, string> = {
  plain: 'The shop keeps each password exactly as typed, and compares the text.',
  sha256: 'The shop keeps a SHA-256 hash of each password, and hashes what you type to compare.',
  salted: 'The shop gives each user a random salt, and keeps SHA-256(salt + password).',
  pbkdf2: `The shop gives each user a salt and runs PBKDF2. This page runs ${ROUNDS} real rounds, so a phone stays smooth.`,
};

function readableTime(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const hours = seconds / 3600;
  return hours < 48 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`;
}

function realSpeed(storage: Storage, accounts: number): string {
  const searches = storage === 'salted' || storage === 'pbkdf2' ? accounts : 1;
  const rate = storage === 'pbkdf2' ? SLOW_RATE : FAST_RATE;
  const rateText = storage === 'pbkdf2' ? '8,000 guesses a second at 600,000 rounds' : '10 billion guesses a second';
  const scope = searches === 1 ? 'one pass covers every account' : `that is one pass for each of the ${accounts} accounts`;
  return `Real lists hold about a billion words. At roughly ${rateText} on one GPU, ${scope}, about ${readableTime((LIST_SIZE * searches) / rate)}.`;
}

function sharedHashes(rows: { name: string; hash: string }[]): string[] {
  const groups = [...new Set(rows.map((row) => row.hash))].map((hash) => rows.filter((row) => row.hash === hash));
  return groups.filter((group) => group.length > 1).map((group) => group.map((row) => row.name).join(' and '));
}

const leakWhy: Record<Storage, (shared: string[]) => string> = {
  plain: () => 'No cracking needed: every password is right there in the table.',
  sha256: (shared) => `Equal hashes mean equal passwords, so the table already gives away that ${shared.map((group) => `${group} share one`).join(', and ')}.`,
  salted: () => 'Every row has its own salt, so even equal passwords look different in the table.',
  pbkdf2: () => 'Every row has its own salt, so even equal passwords look different in the table.',
};

const foundRows = (accounts: readonly string[], found: Map<string, string>) => accounts.map((name) => ({ name, password: found.get(name) ?? 'not found' }));

export function passwordStorageSteps(values: Record<string, string>): Step[] {
  const choice = readChoice(values, 'storage', 'Storage', STORAGE_OPTIONS);
  if (!choice.ok) return refusal(TITLE, choice.why, EMPTY);
  const password = readBytes(values, 'password', 'Password', { min: 1, max: MAX_PASSWORD });
  if (!password.ok) return refusal(TITLE, password.why, EMPTY);

  const storage = SCHEMES[choice.value]!;
  const users = [...USERS, { name: YOU, password: password.value, role: 'customer' }];
  const names = users.map((user) => user.name);
  const site = createShop({ storage, users, limit: 'none' });
  const world = createWorld([site]);
  const story = createStory({ world, code: passwordStorageCode, nodes: ['browser', 'attacker', 'shop', 'db'] });
  const stolen = site.db!.query('SELECT name, hash, salt FROM users').map((row) => ({ name: String(row.name), hash: String(row.hash), salt: String(row.salt) }));
  const salted = storage === 'salted' || storage === 'pbkdf2';

  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: YOU, password: password.value });
  story.step({ title: 'You sign in', why: STORE_WHY[storage], next: 'The attacker gets a copy of the table.', line: STORE_LINE[storage], rows: rowsGrid(stolen, 'users') });
  story.step({
    title: 'The attacker copies the users table',
    why: `A leak like this comes from a bad backup or a bug, not from the sign-in page. ${leakWhy[storage](sharedHashes(stolen))}`,
    next: storage === 'plain' ? 'Nothing is left to do but read it.' : `The attacker tries a list of ${WORDLIST.length} common passwords.`,
    line: 'for (word of wordlist)',
    rows: rowsGrid(stolen, 'users'),
    note: { from: 'attacker', to: 'db', label: 'copies users' },
  });

  const found = new Map<string, string>();
  let guesses = 0;
  if (storage === 'plain') {
    for (const user of users) found.set(user.name, user.password);
  } else if (salted) {
    for (const row of stolen) {
      const at = WORDLIST.findIndex((word) => hashPassword(word, storage, saltFor(row.name, storage)) === row.hash);
      const tried = at === -1 ? WORDLIST.length : at + 1;
      guesses += tried;
      if (at !== -1) found.set(row.name, WORDLIST[at]!);
      story.step({
        title: at === -1 ? `${row.name}: not found after ${tried} guesses` : `${row.name}: "${WORDLIST[at]}" after ${tried} guesses`,
        why: `The salt ${row.salt} belongs to ${row.name} alone, so the attacker hashes the list again from the start for this row.`,
        line: at === -1 ? 'return null' : 'if (guess == row.hash)',
        variables: { guesses },
        rows: rowsGrid(foundRows(names, found), 'found'),
      });
    }
  } else {
    for (const word of WORDLIST) {
      guesses++;
      const hash = hashPassword(word, storage, '');
      const hits = stolen.filter((row) => row.hash === hash).map((row) => row.name);
      if (hits.length === 0) continue;
      for (const name of hits) found.set(name, word);
      story.step({
        title: `"${word}" cracks ${hits.join(' and ')}`,
        why: `With no salt, the attacker hashes "${word}" once and compares it with every row at once.`,
        line: 'if (guess == row.hash)',
        variables: { guesses },
        rows: rowsGrid(foundRows(names, found), 'found'),
      });
    }
  }

  const safe = names.filter((name) => !found.has(name));
  const outcome = safe.length === 0 ? 'Every account fell.' : `${safe.join(' and ')}: not in the list, so not found.`;
  story.step({
    title: `${found.size} of ${users.length} accounts cracked`,
    why: storage === 'plain' ? `${outcome} Plain text needs no guesses at all.` : `${outcome} ${realSpeed(storage, users.length)}`,
    line: storage === 'plain' ? 'if (scheme == plain)' : 'return null',
    variables: { guesses, cracked: found.size, cost: storage === 'pbkdf2' ? guesses * ROUNDS : guesses, result: resultOf(found.has(YOU)) },
    rows: rowsGrid(foundRows(names, found), 'found'),
  });
  return story.steps;
}
