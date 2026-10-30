import type { Step } from '../../types/visualization';
import { attackSteps } from '../steps';
import { USERS } from '../web/data';
import { createShop, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const accessControlCode = `function signedIn(page) {            // every page goes through here
  user = sessions.find(request.cookies.sid)
  return user ? page(user) : 401
}

function order(user, id) {
  row = db.query('SELECT * FROM orders WHERE id = ?', id)
  if (!row) return 404
  if (checkOwner && row.owner != user.name && user.role != 'admin') return 403
  return row
}

function admin(user) {
  if (checkRole && user.role != 'admin') return 403
  return allUsers()
}

function editAccount(user, fields) {
  editable = allowList ? ['name'] : allColumns
  for (field in fields)
    if (field in editable) update(user, field, fields[field])
}`;

export const ATTACK_OPTIONS = ["Someone else's order", 'Admin page by URL', 'Change my role'];

const ALICE = USERS[0];

type Run = { world: World; story: Story };

const usersTable = (world: World) => rowsGrid(world.site('shop').db!.query('SELECT name, role FROM users'), 'users');

const ordersTable = (world: World) => rowsGrid(world.site('shop').db!.rows('orders'), 'orders');

function someoneElsesOrder({ world, story }: Run) {
  const own = world.browser.visit(`${SHOP_ORIGIN}/orders/101`);
  story.step({ title: `alice opens /orders/101 → ${own.status}`, why: `${own.body} This order is alice's own.`, line: 'return row', rows: ordersTable(world) });
  const other = world.browser.visit(`${SHOP_ORIGIN}/orders/102`);
  story.step({
    title: `alice changes 101 to 102 → ${other.status}`,
    why: other.status === 200 ? `${other.body} alice is signed in, but order 102 is bob's. Being signed in says who you are, not what you may touch. The shop never compared the owner with alice.` : `${other.body} The row's owner is bob, so the shop refuses, even though alice is signed in.`,
    line: 'if (checkOwner',
    variables: { status: other.status, result: resultOf(other.status === 200) },
    rows: ordersTable(world),
  });
}

function adminByUrl({ world, story }: Run) {
  const account = world.browser.visit(`${SHOP_ORIGIN}/account`);
  story.step({
    title: 'alice opens the account page',
    why: 'The page shows no admin link to customers. That only hides a button: the page at /admin still exists.',
    line: 'function admin',
    variables: { links: account.body.split('Links: ')[1] ?? '' },
  });
  const page = world.browser.visit(`${SHOP_ORIGIN}/admin`);
  story.step({
    title: `alice types /admin → ${page.status}`,
    why: page.status === 200 ? `${page.body} Hiding the link was the only protection, and anyone can type an address.` : 'The server checks alice\'s role on the request itself, so it makes no difference what the page showed.',
    line: 'if (checkRole',
    variables: { status: page.status, result: resultOf(page.status === 200) },
    rows: usersTable(world),
  });
}

function changeMyRole({ world, story }: Run) {
  story.step({ title: 'alice is a customer', why: 'The account form has one field, name. But a form is only a suggestion: a request can carry any field.', line: 'function editAccount', rows: usersTable(world) });
  const answer = world.browser.submit(`${SHOP_ORIGIN}/account`, { role: 'admin' });
  const promoted = world.site('shop').db!.query("SELECT role FROM users WHERE name = 'alice'")[0]?.role === 'admin';
  story.step({
    title: `alice posts role=admin → ${answer.status}`,
    why: promoted ? 'The shop saved every field it received, so the role column changed.' : 'The shop only saves fields on its list. role is not on it, so it is dropped. The response still says saved.',
    line: 'if (field in editable)',
    rows: usersTable(world),
  });
  const page = world.browser.visit(`${SHOP_ORIGIN}/admin`);
  story.step({
    title: `alice opens /admin → ${page.status}`,
    why: promoted ? 'The role check itself ran and passed, because the row now says admin.' : 'alice is still a customer, so the role check refuses.',
    line: 'if (checkRole',
    variables: { status: page.status, result: resultOf(page.status === 200) },
    rows: usersTable(world),
  });
}

const ATTACKS: Record<string, { access(on: boolean): Partial<ShopOptions['access']>; play(run: Run): void; plan: string }> = {
  "Someone else's order": { access: (ownership) => ({ ownership }), play: someoneElsesOrder, plan: 'The defense is an ownership check.' },
  'Admin page by URL': { access: (roleCheck) => ({ roleCheck }), play: adminByUrl, plan: 'The defense is a role check on the server.' },
  'Change my role': { access: (allowList) => ({ allowList }), play: changeMyRole, plan: 'The defense is an allow-list of editable fields.' },
};

export function accessControlSteps(values: Record<string, string>): Step[] {
  return attackSteps(values, ATTACK_OPTIONS, (attack, defended) => {
    const { access, play, plan } = ATTACKS[attack]!;
    const world = createWorld([createShop({ access: { ...SAFE_SHOP.access, ...access(defended) } })]);
    const story = createStory({ world, code: accessControlCode, nodes: ['browser', 'shop', 'db'] });
    world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: ALICE.name, password: ALICE.password });
    story.step({ title: attack, why: `${plan} It is ${defended ? 'on' : 'off'}. alice has signed in as a customer.`, next: 'A sign-in proves who alice is. The next question is what alice may do.', line: 'function signedIn' });
    play({ world, story });
    return story.steps;
  });
}
