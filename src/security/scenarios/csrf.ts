import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY } from '../steps';
import { USERS } from '../web/data';
import { sql } from '../web/db';
import { createEvil, EVIL_ORIGIN } from '../web/evil';
import { createShop, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid } from '../web/story';
import { createWorld, type World } from '../web/world';

export const csrfCode = `<!-- a page on evil.example, open in alice's browser -->
<form action="https://shop.example/orders" method="post">
  <input name="item" value="Sofa">
</form>
<script>document.forms[0].submit()</script>
<img src="https://shop.example/orders/new?item=Sofa">

function placeOrder(request, user) {
  if (checkToken && request.token != tokenFor(session)) return 403
  if (checkOrigin && request.origin && request.origin != shop) return 403
  insertOrder(user, request.item)
}`;

export const ATTACK_OPTIONS = ['Auto-submitted form', 'Image tag'];

export const DEFENSE_OPTIONS = ['None', 'SameSite', 'Token', 'Origin check'];

const ITEM = 'Sofa';
const WEAK_COOKIE: ShopOptions['cookie'] = { ...SAFE_SHOP.cookie, sameSite: 'None' };

const SHOP_SETTINGS: Record<string, Partial<ShopOptions>> = {
  None: { csrf: 'none', cookie: WEAK_COOKIE },
  SameSite: { csrf: 'none', cookie: { ...SAFE_SHOP.cookie, sameSite: 'Lax' } },
  Token: { csrf: 'token', cookie: WEAK_COOKIE },
  'Origin check': { csrf: 'origin', cookie: WEAK_COOKIE },
};

const SEND: Record<string, (world: World) => ReturnType<World['browser']['visit']>> = {
  'Auto-submitted form': (world) => world.browser.submit(`${SHOP_ORIGIN}/orders`, { item: ITEM }, EVIL_ORIGIN),
  'Image tag': (world) => world.browser.subresource(`${SHOP_ORIGIN}/orders/new?item=${ITEM}`, EVIL_ORIGIN),
};

const LINES: Record<string, string> = { 'Auto-submitted form': '<form action=', 'Image tag': '<img src=' };

function outcome(status: number, attack: string, defense: string): { why: string; line: string } {
  if (status === 401) return { why: 'The browser left the cookie off. A Lax cookie does not go with a form post or an image from another site, so the shop saw no session and refused.', line: 'function placeOrder' };
  if (defense === 'Token') return { why: 'The request has no valid token. The token sits in the shop\'s own form, and evil.example can\'t read that page, so it has nothing to send.', line: 'if (checkToken' };
  if (status === 403) return { why: 'The origin header says evil.example, and that is not the shop, so the shop refused.', line: 'if (checkOrigin' };
  if (defense === 'Origin check') return { why: 'An image request has no origin header, so the check had nothing to compare and let it through. Here is the real flaw: a GET must not change state. Orders belong behind a POST.', line: 'if (checkOrigin' };
  return { why: `The cookie went with the request, so the shop saw alice and placed the order. ${attack === 'Image tag' ? 'alice saw a broken image.' : "alice's tab landed on the shop's Order placed page."} Nothing told the shop that alice never chose this.`, line: 'insertOrder(user, request.item)' };
}

export function csrfSteps(values: Record<string, string>): Step[] {
  const attack = readChoice(values, 'attack', 'Attack', ATTACK_OPTIONS);
  if (!attack.ok) return refusal('Cannot run this attack', attack.why, EMPTY);
  const defense = readChoice(values, 'defense', 'Defense', DEFENSE_OPTIONS);
  if (!defense.ok) return refusal('Cannot run this attack', defense.why, EMPTY);

  const site = createShop(SHOP_SETTINGS[defense.value]!);
  const world = createWorld([site, createEvil()]);
  const story = createStory({ world, code: csrfCode, nodes: ['browser', 'evil', 'shop', 'db'] });
  const orders = () => rowsGrid(site.db!.query(sql`SELECT id, owner, item FROM orders WHERE owner = ${'alice'}`), 'orders');
  const alice = USERS[0];

  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: alice.name, password: alice.password });
  story.step({ title: `${attack.value}, defense: ${defense.value}`, why: `alice is signed in to the shop and has one order. The session cookie is SameSite=${SHOP_SETTINGS[defense.value]!.cookie!.sameSite}.`, next: 'alice opens another tab.', line: 'function placeOrder', rows: orders() });

  world.browser.visit(`${EVIL_ORIGIN}/`);
  story.step({ title: 'alice opens a page on evil.example', why: 'The page offers free cat pictures. Hidden in it is a request to the shop, which the browser sends with no click.', next: 'Does the browser add the cookie?', line: LINES[attack.value]!, rows: orders() });

  const answer = SEND[attack.value]!(world);
  const { why, line } = outcome(answer.status, attack.value, defense.value);
  const placed = site.db!.query(sql`SELECT id FROM orders WHERE item = ${ITEM}`).length > 0;
  story.step({ title: `The shop answers ${answer.status}`, why, line, variables: { status: answer.status, result: resultOf(placed) }, rows: orders() });
  return story.steps;
}
