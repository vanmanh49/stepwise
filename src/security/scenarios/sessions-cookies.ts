import type { Step } from '../../types/visualization';
import { attackSteps } from '../steps';
import { USERS } from '../web/data';
import { createShop, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const sessionsCookiesCode = `function signIn(request, name, password) {
  check(name, password)
  id = rotate ? newId() : (request.cookies.sid ?? newId())
  sessions.insert(id, name)
  setCookie('sid', id, { httpOnly, secure, sameSite: 'Lax' })
}

function newId() {
  return random ? randomBytes(16) : nextNumber++
}

function signOut(request) {
  if (revoke) sessions.delete(request.cookies.sid)
  clearCookie('sid')
}

function account(request) {
  session = sessions.find(request.cookies.sid)
  return session ? page(session.name) : 401
}`;

export const ATTACK_OPTIONS = ['Script reads the cookie', 'Sniffed on http', 'Session fixation', 'Guessable id', 'Stolen after sign-out'];

const ALICE = USERS[0];
const EVE = { name: 'eve', password: 'eve-own-password', role: 'customer' };
const PLANTED = 'fixed-by-eve';

type Run = { world: World; story: Story; defended: boolean };

const sessionsTable = (world: World) => rowsGrid(world.site('shop').db!.rows('sessions'), 'sessions');

const sid = (world: World) => world.browser.jar().find((cookie) => cookie.name === 'sid')?.value ?? '';

function signIn(world: World) {
  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: ALICE.name, password: ALICE.password });
}

/** The attacker's own browser, holding only the cookie it was given. */
function tryAccount(world: World, id: string): boolean {
  return world.send({ method: 'GET', url: `${SHOP_ORIGIN}/account`, headers: id ? { cookie: `sid=${id}` } : {}, body: {} }, 'attacker').status === 200;
}

function finish({ world, story }: Run, id: string, why: string, line: string) {
  const inside = tryAccount(world, id);
  story.step({
    title: inside ? 'The attacker opens alice\'s account' : 'The attacker gets a 401',
    why,
    line,
    variables: { result: resultOf(inside) },
    rows: sessionsTable(world),
  });
}

const signedInStep = (run: Run, why: string) => {
  run.story.step({ title: 'alice signs in', why, line: 'sessions.insert(id, name)', variables: { sid: sid(run.world) }, rows: sessionsTable(run.world) });
};

function scriptReadsCookie(run: Run) {
  const { world, story, defended } = run;
  signIn(world);
  signedInStep(run, `The shop adds a row and sets a cookie ${defended ? 'with HttpOnly' : 'without HttpOnly'}. Look at the flags.`);
  const readable = world.browser.runScript(SHOP_ORIGIN).sid ?? '';
  story.step({
    title: 'A script runs on shop.example',
    why: defended
      ? 'Say a comment box let a script into the page. The browser hides HttpOnly cookies from page scripts, so it reads nothing.'
      : 'Say a comment box let a script into the page. With no HttpOnly flag, the browser hands it the cookie, and it sends the value to the attacker.',
    line: "setCookie('sid'",
    variables: { script: readable ? `sid=${readable}` : 'nothing' },
    note: { from: 'attacker', to: 'browser', label: 'script runs' },
  });
  finish(run, readable, defended ? 'The script had nothing to send, so the attacker has no session. The script can still act inside the page, so HttpOnly limits the damage of a script rather than stopping it.' : 'The cookie is the whole sign-in. Whoever sends it is alice, with no password needed.', 'session = sessions.find');
}

function sniffed(run: Run) {
  const { world, story, defended } = run;
  signIn(world);
  signedInStep(run, `Sign-in runs over https, and the cookie is ${defended ? 'marked Secure' : 'not marked Secure'}.`);
  world.browser.visit('http://shop.example/account');
  const heard = world.sniffed().at(-1)?.cookies?.sid ?? '';
  story.step({
    title: 'alice opens an old http link',
    why: defended
      ? 'The browser sends Secure cookies only over https, so this request carries no cookie. The shop asks alice to sign in.'
      : 'The browser sends the cookie over http too, and http is plain text. Anyone on the same wifi can read it.',
    line: "setCookie('sid'",
    variables: { sniffed: heard || 'nothing' },
    rows: rowsGrid(world.sniffed().map(({ host, url, cookies }) => ({ host, url: url ?? 'hidden', cookie: cookies?.sid ?? 'none' })), 'heard'),
  });
  finish(run, heard, defended ? 'Over https the eavesdropper saw only the host, and over http there was no cookie to see.' : 'One http request was enough. The attacker sends the same cookie and is alice.', 'session = sessions.find');
}

function fixation(run: Run) {
  const { world, story, defended } = run;
  world.browser.plant(`${SHOP_ORIGIN}/`, { name: 'sid', value: PLANTED });
  story.step({
    title: 'The attacker plants a session id',
    why: `Through a shared subdomain or an http page, the attacker sets sid=${PLANTED} in alice's browser before alice signs in.`,
    line: 'id = rotate',
    note: { from: 'attacker', to: 'browser', label: 'plants sid' },
  });
  signIn(world);
  signedInStep(run, defended ? 'The shop ignores the old id and makes a new one, so the planted value is worth nothing.' : 'The shop keeps the id the browser already had. The attacker knows that id.');
  finish(run, PLANTED, defended ? `The row holds a new id, and ${PLANTED} matches nothing.` : `alice signed in on an id the attacker chose, so ${PLANTED} now opens the account.`, 'id = rotate');
}

function guessable(run: Run) {
  const { world, story, defended } = run;
  const answer = world.send({ method: 'POST', url: `${SHOP_ORIGIN}/signin`, headers: {}, body: { name: EVE.name, password: EVE.password } }, 'attacker');
  const own = answer.setCookies.find((cookie) => cookie.name === 'sid')?.value ?? '';
  story.step({
    title: 'The attacker signs in as eve',
    why: defended ? `The attacker's session id is ${own}: 16 random bytes, with no pattern to follow.` : `The attacker's session id is ${own}. That looks like a counter.`,
    line: 'return random',
    rows: sessionsTable(world),
  });
  signIn(world);
  signedInStep(run, 'alice signs in next, so alice has the next id the shop gives out.');
  finish(run, '1002', defended ? 'The attacker tries 1002 and it matches nothing. With 16 random bytes, guessing a real id would take longer than the universe has existed.' : 'The attacker adds 1 to get 1002, and that is alice\'s session.', 'return random');
}

function stolenAfterSignOut(run: Run) {
  const { world, story, defended } = run;
  signIn(world);
  const copy = sid(world);
  signedInStep(run, 'The session is live, and the cookie is in the browser.');
  story.step({
    title: 'The attacker copies the cookie',
    why: `However it happened, the attacker now holds sid=${copy.slice(0, 12)}….`,
    line: "setCookie('sid'",
    note: { from: 'attacker', to: 'browser', label: 'copies sid' },
  });
  world.browser.submit(`${SHOP_ORIGIN}/signout`, {});
  story.step({
    title: 'alice signs out',
    why: defended ? 'The shop deletes the row and clears the cookie.' : 'The shop clears the cookie, but the row stays. alice\'s browser looks signed out either way.',
    line: 'clearCookie',
    rows: sessionsTable(world),
  });
  finish(run, copy, defended ? 'The row is gone, so the copied id matches nothing.' : 'Clearing a cookie only changes alice\'s browser. The row still exists, so the copy still works.', 'if (revoke)');
}

const ATTACKS: Record<string, { options(on: boolean): Partial<ShopOptions>; play(run: Run): void; plan: string }> = {
  'Script reads the cookie': { options: (httpOnly) => ({ cookie: { ...SAFE_SHOP.cookie, httpOnly } }), play: scriptReadsCookie, plan: 'The defense is the HttpOnly flag.' },
  'Sniffed on http': { options: (secure) => ({ cookie: { ...SAFE_SHOP.cookie, secure } }), play: sniffed, plan: 'The defense is the Secure flag.' },
  'Session fixation': { options: (rotateOnSignIn) => ({ rotateOnSignIn }), play: fixation, plan: 'The defense is a new id at sign-in.' },
  'Guessable id': { options: (randomIds) => ({ randomIds }), play: guessable, plan: 'The defense is random ids.' },
  'Stolen after sign-out': { options: (revokeOnSignOut) => ({ revokeOnSignOut }), play: stolenAfterSignOut, plan: 'The defense is deleting the row at sign-out.' },
};

export function sessionsCookiesSteps(values: Record<string, string>): Step[] {
  return attackSteps(values, ATTACK_OPTIONS, (attack, defended) => {
    const { options, play, plan } = ATTACKS[attack]!;
    const world = createWorld([createShop({ users: [...USERS, EVE], ...options(defended) })]);
    const story = createStory({ world, code: sessionsCookiesCode, nodes: ['browser', 'attacker', 'shop', 'db'] });
    story.step({ title: attack, why: `${plan} It is ${defended ? 'on' : 'off'}.`, next: 'A session id in a cookie stands in for the password on every request.', line: 'function signIn' });
    play({ world, story, defended });
    return story.steps;
  });
}

