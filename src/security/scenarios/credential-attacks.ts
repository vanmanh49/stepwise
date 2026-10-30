import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY } from '../steps';
import { LEAKED_PAIRS, USERS, WORDLIST } from '../web/data';
import { createShop, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid } from '../web/story';
import { createWorld, type World } from '../web/world';

export const credentialAttacksCode = `function signIn(name, password, address) {
  if (limit == perIp && recentTries(address) >= 5) return 429
  if (limit == lockout && failures[name] >= 5) return 423
  if (matches(name, password)) {
    failures[name] = 0
    return session(name)
  }
  failures[name] += 1
  return 401
}`;

export const ATTACK_OPTIONS = ['Guessing', 'Credential stuffing', 'Password spraying'];
export const DEFENSES = ['None', 'Per-IP limit', 'Account lockout'];

const LIMITS: Record<string, ShopOptions['limit']> = { None: 'none', 'Per-IP limit': 'ip', 'Account lockout': 'lockout' };

const TITLE = 'Cannot run this attack';
const ATTACKER_IP = '10.0.0.66';
const SECONDS_BETWEEN = 2;
const REAL_HELP = 'What helps here is MFA, and breached-password checks that refuse passwords already in leaked lists.';

type Attempt = { name: string; password: string; ip: string };

const ATTEMPTS: Record<string, Attempt[]> = {
  Guessing: WORDLIST.map((password) => ({ name: 'alice', password, ip: ATTACKER_IP })),
  'Credential stuffing': LEAKED_PAIRS.map((pair, i) => ({ ...pair, ip: `10.0.1.${i + 1}` })),
  'Password spraying': USERS.map(({ name }) => ({ name, password: 'sunshine', ip: ATTACKER_IP })),
};

const PLAN: Record<string, { title: string; why: string }> = {
  Guessing: { title: 'The attacker targets alice', why: `One account, one address, and a list of ${WORDLIST.length} common passwords.` },
  'Credential stuffing': { title: 'The attacker replays a leak', why: `${LEAKED_PAIRS.length} names and passwords leaked from another site, each tried once from a new address. People reuse passwords.` },
  'Password spraying': { title: 'The attacker sprays one password', why: `One common password, sunshine, tried once on each of ${USERS.length} accounts from one address.` },
};

const STATUS_TEXT: Record<number, { outcome: string; line: string }> = {
  200: { outcome: 'the shop gives a session', line: 'return session(name)' },
  401: { outcome: 'wrong, and the shop counts one failure', line: 'return 401' },
  423: { outcome: 'the account is locked, so the password is not even checked', line: 'if (limit == lockout' },
  429: { outcome: 'too many tries from this address, so the password is not even checked', line: 'if (limit == perIp' },
};

function closing(attack: string, defense: string, broke: string[]): string {
  const who = broke.join(' and ');
  if (attack === 'Guessing') {
    if (defense === 'None') return `Nothing limited the tries, so ${who} fell to a short list.`;
    if (defense === 'Per-IP limit') return 'The address hit its limit before reaching the right word. This only slows guessing: after 60 s the attacker gets 5 more tries, and many addresses get more.';
    return 'The account locked before the right word arrived, but the lock also locked alice out. Anyone who knows a name can do this to any user, so real systems lock for a short time or add a delay.';
  }
  const dodge = attack === 'Credential stuffing' ? 'Every try came from a new address and hit a different account' : 'Each account saw one try, and one address made fewer than 5';
  const passes = defense === 'None' ? 'Nothing limited the tries.' : `${dodge}, so the ${defense.toLowerCase()} never fired.`;
  return `${passes} ${who} got in with a right password. ${REAL_HELP}`;
}

function play(attempts: Attempt[], world: World, each: (attempt: Attempt, status: number, index: number) => void) {
  const wins: { name: string; sid: string }[] = [];
  for (const [index, attempt] of attempts.entries()) {
    const answer = world.send({ method: 'POST', url: `${SHOP_ORIGIN}/signin`, headers: { ip: attempt.ip }, body: { name: attempt.name, password: attempt.password } }, 'attacker');
    each(attempt, answer.status, index);
    const sid = answer.setCookies.find((cookie) => cookie.name === 'sid')?.value;
    if (sid) wins.push({ name: attempt.name, sid });
    if (answer.status === 200 && attempts.every((other) => other.name === attempt.name)) break;
    if (answer.status === 423 || answer.status === 429) break;
    world.advance(SECONDS_BETWEEN);
  }
  return wins;
}

export function credentialAttacksSteps(values: Record<string, string>): Step[] {
  const attack = readChoice(values, 'attack', 'Attack', ATTACK_OPTIONS);
  if (!attack.ok) return refusal(TITLE, attack.why, EMPTY);
  const defense = readChoice(values, 'defense', 'Defense', DEFENSES);
  if (!defense.ok) return refusal(TITLE, defense.why, EMPTY);

  const world = createWorld([createShop({ limit: LIMITS[defense.value]! })]);
  const start = world.now();
  const story = createStory({ world, code: credentialAttacksCode, nodes: ['browser', 'attacker', 'shop', 'db'] });
  const tries: Record<string, string | number>[] = [];
  story.step({ ...PLAN[attack.value]!, next: `The shop's defense: ${defense.value.toLowerCase()}.`, line: 'function signIn' });

  const wins = play(ATTEMPTS[attack.value]!, world, ({ name, password, ip }, status, index) => {
    tries.push({ name, ip, status });
    const { outcome, line } = STATUS_TEXT[status]!;
    story.step({
      title: `Try ${index + 1}: ${name} / ${password} → ${status}`,
      why: `From ${ip}: ${outcome}.`,
      line,
      variables: { seconds: world.now() - start, tries: tries.length },
      rows: rowsGrid(tries, 'tries'),
    });
  });

  const lockedOut = attack.value === 'Guessing' && defense.value === 'Account lockout';
  if (lockedOut) {
    const real = USERS[0];
    const answer = world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: real.name, password: real.password });
    story.step({
      title: `The real alice signs in → ${answer.status}`,
      why: 'alice types the right password and is refused. The attacker\'s failures locked the account for its owner too.',
      line: 'if (limit == lockout',
    });
  }

  for (const { name, sid } of wins.slice(0, 1)) {
    world.send({ method: 'GET', url: `${SHOP_ORIGIN}/account`, headers: { cookie: `sid=${sid}` }, body: {} }, 'attacker');
    story.step({ title: `The attacker opens ${name}'s account`, why: 'The session cookie from that sign-in works like any other.', line: 'return session(name)' });
  }

  const broke = wins.map((win) => win.name);
  story.step({
    title: broke.length > 0 ? `The attacker got in as ${broke.join(' and ')}` : 'The attacker did not get in',
    why: closing(attack.value, defense.value, broke),
    line: wins.length > 0 ? 'return session(name)' : lockedOut ? 'if (limit == lockout' : 'if (limit == perIp',
    variables: { tries: tries.length, seconds: world.now() - start, result: resultOf(broke.length > 0) },
    rows: rowsGrid(tries, 'tries'),
  });
  return story.steps;
}
