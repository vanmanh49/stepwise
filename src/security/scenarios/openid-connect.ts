import type { GridView, Step } from '../../types/visualization';
import { splitToken } from '../crypto/jwt';
import { attackSteps } from '../steps';
import { USERS } from '../web/data';
import { createEvil, evilInbox } from '../web/evil';
import { queryOf } from '../web/http';
import { createLogin, EVIL_CLIENT, LOGIN_ORIGIN } from '../web/login';
import { createShop, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const openidConnectCode = `function signInWithIdToken(token, flow) {
  key = get(login + '/jwks')
  if (!signatureMatches(token, key)) return 401        // always
  if (token.iss != 'https://login.example') return 401 // always
  if (checkAud && token.aud != 'shop') return 401
  if (checkNonce && token.nonce != flow.nonce) return 401
  if (checkExp && now >= token.exp) return 401
  signIn(token.sub)
}

function signInWithAccessToken(accessToken) {
  if (idTokenOnly) return 401
  user = get(login + '/userinfo', accessToken)
  signIn(user.sub)
}`;

export const ATTACK_OPTIONS = ['Token for another app', 'Replayed token', 'Expired token', 'Access token as login'];

const ALICE = USERS[0];
const PAST_EXP = 3700;

type Claim = 'aud' | 'nonce' | 'exp';
type Run = { world: World; story: Story; defended: boolean };

const parseJson = (body: string) => JSON.parse(body) as Record<string, string>;

function aliceSignsIn({ world, story }: Run) {
  world.browser.submit(`${LOGIN_ORIGIN}/signin`, { name: ALICE.name, password: ALICE.password });
  story.step({ title: 'alice signs in at login.example', why: 'The provider now knows alice, and can vouch for alice to any app that asks.', line: 'function signInWithIdToken' });
}

/** alice uses evil-app, a real registered app that the attacker runs. */
function evilAppTokens({ world }: Run, nonce = ''): Record<string, string> {
  const query = new URLSearchParams({ client_id: EVIL_CLIENT.id, redirect_uri: EVIL_CLIENT.redirect, state: 'x', nonce });
  world.browser.visit(`${LOGIN_ORIGIN}/authorize?${query}`);
  const code = evilInbox(world).at(-1) ?? '';
  return parseJson(world.send({ method: 'POST', url: `${LOGIN_ORIGIN}/token`, headers: {}, body: { code, client_id: EVIL_CLIENT.id } }, 'evil').body);
}

/** `outcome` is what happened to the attacked claim. */
function claimsGrid(token: string, attacked: Claim, off: Claim[], outcome: string): GridView {
  const { iss, aud, nonce, exp } = splitToken(token)!.payload;
  const check = (claim: Claim) => (claim === attacked ? outcome : off.includes(claim) ? 'not checked' : 'passed');
  return rowsGrid([
    { claim: 'signature', value: 'TOY-RS', check: 'passed' },
    { claim: 'iss', value: iss, check: 'passed' },
    { claim: 'aud', value: aud, check: check('aud') },
    { claim: 'nonce', value: nonce, check: check('nonce') },
    { claim: 'exp', value: exp, check: check('exp') },
  ], 'claims');
}

function hand(run: Run, token: string, cookie: string, attacked: Claim, off: Claim[], inWhy: string, line: string) {
  const { world, story, defended } = run;
  const answer = world.send({ method: 'POST', url: `${SHOP_ORIGIN}/signin/id-token`, headers: cookie ? { cookie } : {}, body: { id_token: token } }, 'attacker');
  const inside = answer.status === 200;
  story.step({
    title: `The attacker hands the token to the shop → ${answer.status}`,
    why: inside ? inWhy : `${answer.body} The shop's other checks passed, so this one claim made the difference.`,
    line,
    variables: { result: resultOf(inside) },
    rows: claimsGrid(token, attacked, off, defended ? 'failed' : 'not checked'),
  });
}

function otherApp(run: Run) {
  const { world, story } = run;
  aliceSignsIn(run);
  const flow = world.send({ method: 'GET', url: `${SHOP_ORIGIN}/signin/provider`, headers: {}, body: {} }, 'attacker');
  const nonce = queryOf(flow.redirect ?? '').nonce ?? '';
  const cookie = `oauth=${flow.setCookies[0]?.value}`;
  story.step({
    title: 'The attacker starts a sign-in at the shop',
    why: `The attacker only wants the nonce the shop will expect: ${nonce}. It goes into evil-app's own sign-in request.`,
    line: 'if (checkNonce',
  });
  const token = evilAppTokens(run, nonce).id_token ?? '';
  story.step({
    title: 'alice signs in to evil-app',
    why: 'evil-app looks like a harmless quiz, and alice is happy to use the provider. It receives a real ID token: right issuer, right signature, right person.',
    line: 'if (checkAud',
    rows: rowsGrid(Object.entries(splitToken(token)!.payload).map(([claim, value]) => ({ claim, value })), 'claims'),
  });
  hand(run, token, cookie, 'aud', [], 'The token was made for evil-app, but the shop never read aud. Any app alice has ever used could now sign in to the shop as alice.', 'if (checkAud');
}

function replayed(run: Run) {
  const { world, story, defended } = run;
  aliceSignsIn(run);
  world.browser.visit(`${SHOP_ORIGIN}/signin/provider`);
  const token = parseJson(world.events.find((event) => event.request.url.endsWith('/token'))!.response.body).id_token ?? '';
  story.step({
    title: 'alice signs in to the shop',
    why: 'A normal sign-in. The shop made a nonce for this sign-in, and the token carries it. The token stays valid for an hour.',
    line: 'signIn(token.sub)',
    rows: claimsGrid(token, 'nonce', [], defended ? 'passed' : 'not checked'),
  });
  story.step({ title: 'The attacker finds the token in a log', why: 'A token in a log or a browser history is easy to copy, and it has not expired.', line: 'if (checkNonce', note: { from: 'attacker', to: 'browser', label: 'copies token' } });
  hand(run, token, '', 'nonce', [], 'The token is real and unexpired, and nothing checked that this sign-in was the one it came from.', 'if (checkNonce');
}

function expired(run: Run) {
  const { world, story, defended } = run;
  aliceSignsIn(run);
  world.browser.visit(`${SHOP_ORIGIN}/signin/provider`);
  const token = parseJson(world.events.find((event) => event.request.url.endsWith('/token'))!.response.body).id_token ?? '';
  story.step({ title: 'alice signs in to the shop', why: 'The ID token is valid for one hour. This run leaves the nonce check off, so exp alone decides.', line: 'signIn(token.sub)', rows: claimsGrid(token, 'exp', ['nonce'], defended ? 'passed' : 'not checked') });
  world.advance(PAST_EXP);
  story.step({ title: 'More than an hour passes', why: `The simulated clock moves on ${PAST_EXP} s, past exp. The attacker still has a copy.`, line: 'if (checkExp' });
  hand(run, token, '', 'exp', ['nonce'], 'The signature never expires, so only exp ends a token. The shop did not read it.', 'if (checkExp');
}

function accessToken(run: Run) {
  const { world, story, defended } = run;
  aliceSignsIn(run);
  const token = evilAppTokens(run).access_token ?? '';
  story.step({
    title: 'alice signs in to evil-app',
    why: 'evil-app receives an access token. It says the holder may act for alice. It does not say that alice just signed in to this app.',
    line: 'function signInWithAccessToken',
    rows: rowsGrid([{ part: 'access token', value: token }], 'access'),
  });
  const answer = world.send({ method: 'POST', url: `${SHOP_ORIGIN}/signin/access-token`, headers: {}, body: { access_token: token } }, 'attacker');
  const inside = answer.status === 200;
  story.step({
    title: `The attacker hands it to the shop → ${answer.status}`,
    why: defended
      ? 'The shop accepts only an ID token as proof of sign-in. An ID token names its audience, and an access token is a key that anyone can hold.'
      : 'The shop asks /userinfo whose token this is, gets alice, and signs the holder in. Any app alice used can now be alice here.',
    line: defended ? 'if (idTokenOnly' : "user = get(login + '/userinfo'",
    variables: { result: resultOf(inside) },
  });
}

const ATTACKS: Record<string, { shop(on: boolean): Partial<ShopOptions['idToken']>; play(run: Run): void; plan: string }> = {
  'Token for another app': { shop: (aud) => ({ aud }), play: otherApp, plan: 'The defense is checking aud.' },
  'Replayed token': { shop: (nonce) => ({ nonce }), play: replayed, plan: 'The defense is checking nonce.' },
  'Expired token': { shop: (exp) => ({ exp, nonce: false }), play: expired, plan: 'The defense is checking exp.' },
  'Access token as login': { shop: (idTokenOnly) => ({ idTokenOnly }), play: accessToken, plan: 'The defense is accepting only an ID token.' },
};

export function openidConnectSteps(values: Record<string, string>): Step[] {
  return attackSteps(values, ATTACK_OPTIONS, (attack, defended) => {
    const { shop, play, plan } = ATTACKS[attack]!;
    const world = createWorld([createShop({ idToken: { ...SAFE_SHOP.idToken, ...shop(defended) } }), createLogin({ pkce: false }), createEvil()]);
    const story = createStory({ world, code: openidConnectCode, nodes: ['browser', 'attacker', 'evil', 'shop', 'login'] });
    story.step({ title: attack, why: `${plan} It is ${defended ? 'on' : 'off'}. The shop always checks the signature and iss.`, next: 'An ID token is a signed statement from the provider: this person, this app, right now.', line: 'function signInWithIdToken' });
    play({ world, story, defended });
    return story.steps;
  });
}
