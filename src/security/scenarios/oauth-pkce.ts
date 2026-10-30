import type { Step } from '../../types/visualization';
import { attackSteps } from '../steps';
import { USERS } from '../web/data';
import { createEvil, evilInbox, EVIL_ORIGIN } from '../web/evil';
import { queryOf } from '../web/http';
import { ATTACKER_ACCOUNT, createLogin, LOGIN_ORIGIN, s256Challenge, SHOP_CLIENT, type LoginOptions } from '../web/login';
import { createShop, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid, type NodeId, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const oauthPkceCode = `// shop.example
function startSignIn() {
  state = random(), verifier = random()
  remember(state, verifier)
  redirect(login + '/authorize', {
    client_id, redirect_uri, state,
    code_challenge: base64url(sha256(verifier)) })
}

function callback(code, state) {
  if (checkState && state != remembered.state) return 400
  tokens = post(login + '/token', { code, client_id, code_verifier: remembered.verifier })
  signIn(tokens.id_token)
}

// login.example
function authorize(client, redirect_uri, challenge) {
  if (exactRedirect && redirect_uri != client.redirect) return 400
  if (!redirect_uri.startsWith(client.origin)) return 400
  redirect(redirect_uri, { code: newCode(challenge), state })
}

function token(code, code_verifier) {
  if (pkce && base64url(sha256(code_verifier)) != grant.challenge) return 400
  return tokens
}`;

export const ATTACK_OPTIONS = ['Stolen code', 'Login CSRF', 'Redirect tampering'];

const ALICE = USERS[0];
const TAMPERED = 'https://shop.example.evil.example/cb';
const ATTACKER_VERIFIER = 'chosen-by-the-attacker';

type Run = { world: World; story: Story; defended: boolean };

const attackerPost = (world: World, url: string, body: Record<string, string>) => world.send({ method: 'POST', url, headers: {}, body }, 'attacker');

const signedInName = (world: World) => world.browser.visit(`${SHOP_ORIGIN}/account`).body.match(/Signed in as (\w+)/)?.[1] ?? 'nobody';

function aliceAtProvider({ world, story }: Run) {
  world.browser.submit(`${LOGIN_ORIGIN}/signin`, { name: ALICE.name, password: ALICE.password });
  story.step({ title: 'alice signs in at login.example', why: 'The shop never sees this password. Only the provider does.', line: '// login.example' });
}

function stolenCode(run: Run) {
  const { world, story, defended } = run;
  aliceAtProvider(run);
  const held = world.browser.visit(`${SHOP_ORIGIN}/signin/provider`, undefined, `${SHOP_ORIGIN}/callback`);
  const callback = held.redirect ?? '';
  const code = queryOf(callback).code ?? '';
  const authorize = world.events.find((event) => event.request.url.includes('/authorize'))!;
  const challenge = queryOf(authorize.request.url).code_challenge ?? '';
  story.step({
    title: 'alice approves, and a code comes back',
    why: `The shop sent ${challenge.slice(0, 12)}…, the SHA-256 of a secret verifier it keeps. The code travels through the browser, so logs, extensions or a bad app on the device can see it.`,
    line: 'redirect(redirect_uri',
    variables: { challenge },
    rows: rowsGrid([{ part: 'code', value: code }, { part: 'code_challenge', value: challenge }], 'flow'),
  });
  const stolen = attackerPost(world, `${LOGIN_ORIGIN}/token`, { code, client_id: SHOP_CLIENT.id });
  story.step({
    title: `The attacker redeems the code → ${stolen.status}`,
    why: defended
      ? `The attacker has the code but not the verifier. An empty verifier hashes to ${s256Challenge('').slice(0, 12)}…, which does not match, so the provider refuses.`
      : 'The provider only asked for the code, so whoever holds it first gets the tokens.',
    line: 'if (pkce &&',
    variables: { status: stolen.status },
  });
  const arrival = world.browser.visit(callback);
  story.step({
    title: `alice arrives at the shop → ${arrival.status}`,
    why: arrival.status === 200 ? 'The shop sends its verifier, the hash matches, and alice is signed in.' : 'The code was already used, so the provider refuses the shop. alice sees an error and tries again, none the wiser.',
    line: 'tokens = post(',
    variables: { status: arrival.status },
  });
  story.step({
    title: stolen.status === 200 ? 'The attacker holds alice\'s tokens' : 'The stolen code is worthless',
    why: stolen.status === 200 ? 'Those tokens act as alice until they expire.' : 'A stolen code alone proves nothing. Only the app that started the flow can finish it.',
    line: 'if (pkce &&',
    variables: { result: resultOf(stolen.status === 200) },
  });
}

function loginCsrf({ world, story, defended }: Run) {
  const signin = attackerPost(world, `${LOGIN_ORIGIN}/signin`, ATTACKER_ACCOUNT);
  const query = new URLSearchParams({ client_id: SHOP_CLIENT.id, redirect_uri: SHOP_CLIENT.redirect, state: 'made-up' });
  const own = world.send({ method: 'GET', url: `${LOGIN_ORIGIN}/authorize?${query}`, headers: { cookie: `login=${signin.setCookies[0]?.value}` }, body: {} }, 'attacker');
  story.step({
    title: 'The attacker gets a code for eve',
    why: 'The attacker signs in as eve, an ordinary account, and stops before using the code. It belongs to eve, and nothing yet ties it to any browser.',
    line: 'redirect(redirect_uri',
  });
  const link = own.redirect ?? '';
  const arrival = world.browser.visit(link, EVIL_ORIGIN);
  story.step({
    title: `evil.example sends alice's browser to the callback → ${arrival.status}`,
    why: defended
      ? 'The browser holds no flow with this state, so the shop refuses and uses no code.'
      : 'The shop never checked that this browser started the flow, so it redeems eve\'s code here.',
    line: 'if (checkState',
    note: { from: 'browser', to: 'evil', label: 'opens the page' },
  });
  const browser = signedInName(world);
  story.step({
    title: browser === 'nobody' ? 'alice\'s browser stays signed out' : 'alice\'s browser is signed in as eve',
    why: browser === 'nobody'
      ? 'state ties the callback to the browser that started the flow. A link made by someone else can\'t carry the right value.'
      : 'alice may not notice, and then saves a card or address into eve\'s account, where the attacker can read it. In OpenID Connect the nonce would catch this too, so this run leaves it out.',
    line: 'if (checkState',
    variables: { browser, result: resultOf(browser !== 'nobody') },
  });
}

function redirectTampering(run: Run) {
  const { world, story, defended } = run;
  aliceAtProvider(run);
  const query = new URLSearchParams({ client_id: SHOP_CLIENT.id, redirect_uri: TAMPERED, state: 'x', code_challenge: s256Challenge(ATTACKER_VERIFIER) });
  story.step({
    title: 'The attacker writes a sign-in link',
    why: `It names the real shop as the app, but redirect_uri is ${TAMPERED}, which starts with the shop's address. The attacker wrote the link, so the PKCE challenge is the attacker's too, and PKCE can't help.`,
    line: 'function authorize',
  });
  const answer = world.browser.visit(`${LOGIN_ORIGIN}/authorize?${query}`);
  const inbox = evilInbox(world);
  story.step({
    title: `alice opens the link → ${answer.status}`,
    why: defended
      ? 'The provider compares the whole address with the registered one, so it refuses and sends no code.'
      : 'The provider only checks how the address starts. alice is already signed in, so it sends the code straight to evil.example.',
    line: defended ? 'if (exactRedirect' : 'if (!redirect_uri.startsWith',
    variables: { inbox: inbox.length },
  });
  const redeemed = inbox[0] !== undefined && attackerPost(world, `${LOGIN_ORIGIN}/token`, { code: inbox[0], client_id: SHOP_CLIENT.id, code_verifier: ATTACKER_VERIFIER }).status === 200;
  story.step({
    title: redeemed ? 'The attacker redeems the code' : 'evil.example receives nothing',
    why: redeemed ? 'The attacker sends the verifier from the link, and gets alice\'s tokens.' : 'With no code, there is nothing to redeem.',
    line: 'function token',
    variables: { result: resultOf(redeemed) },
  });
}

const ATTACKS: Record<string, { shop(on: boolean): Partial<ShopOptions>; login(on: boolean): Partial<LoginOptions>; play(run: Run): void; nodes: NodeId[]; plan: string }> = {
  'Stolen code': { shop: () => ({}), login: (pkce) => ({ pkce }), play: stolenCode, nodes: ['browser', 'attacker', 'shop', 'login'], plan: 'The defense is PKCE.' },
  'Login CSRF': { shop: (checkState) => ({ checkState, idToken: { ...SAFE_SHOP.idToken, nonce: false } }), login: () => ({ pkce: false }), play: loginCsrf, nodes: ['browser', 'attacker', 'evil', 'shop', 'login'], plan: 'The defense is checking state.' },
  'Redirect tampering': { shop: () => ({}), login: (exactRedirect) => ({ exactRedirect }), play: redirectTampering, nodes: ['browser', 'attacker', 'evil', 'login'], plan: 'The defense is exact redirect matching.' },
};

export function oauthPkceSteps(values: Record<string, string>): Step[] {
  return attackSteps(values, ATTACK_OPTIONS, (attack, defended) => {
    const { shop, login, play, nodes, plan } = ATTACKS[attack]!;
    const world = createWorld([createShop(shop(defended)), createLogin(login(defended)), createEvil()]);
    const story = createStory({ world, code: oauthPkceCode, nodes });
    story.step({ title: attack, why: `${plan} It is ${defended ? 'on' : 'off'}.`, next: 'In this flow the shop never sees alice\'s password. The provider hands back a short-lived code instead.', line: 'function startSignIn' });
    play({ world, story, defended });
    return story.steps;
  });
}
