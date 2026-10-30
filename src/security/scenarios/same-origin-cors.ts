import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY } from '../steps';
import { USERS } from '../web/data';
import { createEvil, EVIL_ORIGIN } from '../web/evil';
import { createShop, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { APP_ORIGIN } from '../web/shop-cors';
import { createStory, resultOf, rowsGrid, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const sameOriginCorsCode = `// a page on evil.example, open in alice's browser
answer = fetch('https://shop.example/account', { credentials: 'include' })
showTo(page, answer.body)

function pageMayRead(answer, origin, credentials) {
  allowed = answer.headers['access-control-allow-origin']
  if (!allowed) return false
  if (allowed == '*') return !credentials     // never with cookies
  if (allowed != origin) return false
  return !credentials || answer.headers['access-control-allow-credentials'] == 'true'
}

// a PUT is not a simple request, so the browser asks first
preflight = OPTIONS /account
if (!pageMayRead(preflight, origin, credentials)) stop
answer = PUT /account`;

export const ATTACK_OPTIONS = ['Read my account', 'Change my account'];

export const CORS_OPTIONS = ['None', 'One origin', 'Reflect any', 'Wildcard'];

const CORS: Record<string, ShopOptions['cors']> = { None: 'none', 'One origin': 'one', 'Reflect any': 'reflect', Wildcard: 'wildcard' };

const WHY_ALLOWED: Record<string, string> = {
  None: 'The shop sends no CORS headers, so only pages on shop.example may read its answers.',
  'One origin': `The shop allows ${APP_ORIGIN}, its own front end, and nothing else.`,
  'Reflect any': 'The shop copies the origin of each request into its answer, so it allows every page on the web.',
  Wildcard: 'The shop answers with *. That is fine for public data, and browsers refuse it for a request with cookies.',
};

type Run = { world: World; story: Story; choice: string };

const usersTable = (world: World) => rowsGrid(world.site('shop').db!.query('SELECT name, role FROM users'), 'users');

function readAccount({ world, story, choice }: Run) {
  const answer = world.browser.fetchFrom(EVIL_ORIGIN, `${SHOP_ORIGIN}/account`, { credentials: true });
  story.step({
    title: `The page reads /account → ${answer.status}`,
    why: 'The browser added the cookie and sent the request. The shop answered with alice\'s account. The same-origin policy does not stop a request going out. It decides whether the page may read the answer.',
    next: 'The answer is in the browser. Does the page get to see it?',
    line: "answer = fetch('https://shop.example/account'",
  });
  story.step({
    title: answer.readable ? 'The browser hands the answer to the page' : 'The browser keeps the answer from the page',
    why: answer.readable ? `The page reads: ${answer.body} ${WHY_ALLOWED[choice]} A page on evil.example now holds alice's data.` : `The page cannot read it: ${answer.blockedBy}. ${WHY_ALLOWED[choice]}`,
    line: answer.readable ? 'showTo(page, answer.body)' : 'if (!allowed) return false',
    variables: { status: answer.status, readable: String(answer.readable), result: resultOf(answer.readable) },
  });
}

function changeAccount({ world, story, choice }: Run) {
  const answer = world.browser.fetchFrom(EVIL_ORIGIN, `${SHOP_ORIGIN}/account`, { method: 'PUT', credentials: true, body: { name: 'mallory' } });
  const preflight = world.events.find((event) => event.request.method === 'OPTIONS')!;
  story.step({
    title: `The browser asks first: OPTIONS /account → ${preflight.response.status}`,
    why: 'A PUT with cookies can change data, so the browser checks before it sends anything. This check carries no cookies.',
    next: 'Does the answer allow this page to send the PUT?',
    line: 'preflight = OPTIONS /account',
    rows: usersTable(world),
  });
  story.step({
    title: answer.sent ? `The browser sends the PUT → ${answer.status}` : 'The browser stops the PUT',
    why: answer.sent ? `The preflight allowed it. ${WHY_ALLOWED[choice]} alice's name is now mallory, changed by a page alice only looked at.` : `The PUT was never sent: ${answer.blockedBy}. ${WHY_ALLOWED[choice]}`,
    line: answer.sent ? 'answer = PUT /account' : 'if (!pageMayRead(preflight, origin, credentials)) stop',
    variables: { put: answer.sent ? answer.status : 'not sent', result: resultOf(answer.sent) },
    rows: usersTable(world),
  });
}

const ATTACKS: Record<string, (run: Run) => void> = { 'Read my account': readAccount, 'Change my account': changeAccount };

export function sameOriginCorsSteps(values: Record<string, string>): Step[] {
  const attack = readChoice(values, 'attack', 'Attack', ATTACK_OPTIONS);
  if (!attack.ok) return refusal('Cannot run this attack', attack.why, EMPTY);
  const cors = readChoice(values, 'cors', 'CORS policy', CORS_OPTIONS);
  if (!cors.ok) return refusal('Cannot run this attack', cors.why, EMPTY);

  // SameSite=None, or the browser would send no cookie across sites and CORS would have nothing to protect.
  const world = createWorld([createShop({ cors: CORS[cors.value]!, cookie: { ...SAFE_SHOP.cookie, sameSite: 'None' } }), createEvil()]);
  const story = createStory({ world, code: sameOriginCorsCode, nodes: ['browser', 'evil', 'shop'] });
  const alice = USERS[0];
  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: alice.name, password: alice.password });
  world.browser.visit(`${EVIL_ORIGIN}/`);
  story.step({
    title: 'alice opens a page on evil.example',
    why: 'alice is signed in to shop.example with a SameSite=None cookie, so the browser will send it with requests from any site. The page on evil.example now tries its script.',
    next: 'The page calls the shop from alice\'s browser.',
    line: '// a page on evil.example',
  });
  ATTACKS[attack.value]!({ world, story, choice: cors.value });
  return story.steps;
}
