import type { GridView, Step } from '../../types/visualization';
import { encodeBase64url } from '../crypto/base64url';
import { utf8 } from '../crypto/bytes';
import { hs256Signature, signHs256, splitToken, unsignedToken } from '../crypto/jwt';
import { attackSteps } from '../steps';
import { TOKEN_SECRET, USERS, WORDLIST } from '../web/data';
import { createShop, DEFAULT_TOKEN, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const jsonWebTokensCode = `function verify(token) {
  [header, payload, signature] = decode(token)
  if (fixedAlg && header.alg != 'HS256') return null
  if (header.alg == 'none') return payload     // the token decides
  if (checkSignature && hmac(secret, header + '.' + payload) != signature) return null
  if (now >= payload.exp) return null
  return payload
}

function admin(request) {
  user = verify(request.cookies.token)
  if (!user) return 401
  return user.role == 'admin' ? page : 403
}`;

export const ATTACK_OPTIONS = ['Edit the payload', 'alg: none', 'Weak secret', 'Stolen token'];

const ALICE = USERS[0];
const WAIT = 600;
const LONG_TTL = 86_400;
const SHORT_TTL = 300;

type Run = { world: World; story: Story; defended: boolean; token: string };

function partsGrid(token: string, prefix: string): GridView {
  const parts = splitToken(token)!;
  const { sub, role, exp } = parts.payload;
  return rowsGrid([
    { part: 'alg', value: parts.header.alg },
    { part: 'sub', value: sub },
    { part: 'role', value: role },
    { part: 'exp', value: exp },
    { part: 'signature', value: parts.signature || 'empty' },
  ], prefix);
}

const asAttacker = (world: World, path: string, token: string) => world.send({ method: 'GET', url: `${SHOP_ORIGIN}${path}`, headers: { cookie: `token=${token}` }, body: {} }, 'attacker').status;

function finishAdmin({ world, story }: Run, token: string, inWhy: string, outWhy: string, line: string) {
  const status = asAttacker(world, '/admin', token);
  const inside = status === 200;
  story.step({
    title: `The attacker opens /admin → ${status}`,
    why: inside ? inWhy : outWhy,
    line,
    variables: { result: resultOf(inside) },
  });
}

function editPayload(run: Run) {
  const { story, token, defended } = run;
  const [header, , signature] = token.split('.');
  const payload = encodeBase64url(utf8(JSON.stringify({ ...splitToken(token)!.payload, role: 'admin' })));
  const edited = `${header}.${payload}.${signature}`;
  story.step({
    title: 'The attacker edits the payload',
    why: 'The payload is only base64url, not encrypted. Changing role to admin takes a text editor. The old signature stays on the end.',
    line: '[header, payload, signature] = decode(token)',
    rows: partsGrid(edited, 'edited'),
  });
  finishAdmin(run, edited, 'The shop read the payload without checking the signature, so alice\'s token now says admin.', 'The signature covers the old payload, so the shop recomputes it, sees a mismatch and refuses.', defended ? 'if (checkSignature' : 'return user.role');
}

function algNone(run: Run) {
  const { story, token } = run;
  const parts = splitToken(token)!;
  const forged = unsignedToken({ ...parts.payload, role: 'admin' });
  story.step({
    title: 'The attacker sets alg to none',
    why: 'JWT has an "unsigned" algorithm for tokens that need no protection. The attacker uses it, changes the role and leaves the signature empty.',
    line: "if (header.alg == 'none')",
    rows: partsGrid(forged, 'forged'),
  });
  finishAdmin(run, forged, 'The shop let the token pick its own algorithm, so the token told it to skip the check.', 'The shop only accepts HS256, whatever the header says.', "if (fixedAlg && header.alg != 'HS256')");
}

function weakSecret(run: Run) {
  const { story, token } = run;
  const parts = splitToken(token)!;
  const found = WORDLIST.find((word) => hs256Signature(parts.signedPart, utf8(word)) === parts.signature);
  story.step({
    title: 'The attacker tests a list of secrets',
    why: found
      ? `A token is an offline test: sign with a guess and compare, with no server to rate limit it. "${found}" matches on word ${WORDLIST.indexOf(found) + 1} of ${WORDLIST.length}.`
      : `A token is an offline test: sign with a guess and compare. None of the ${WORDLIST.length} words match, because the real secret is 32 random bytes.`,
    line: 'hmac(secret',
    variables: { secret: found ?? 'not found' },
  });
  const forged = signHs256({ ...parts.payload, role: 'admin' }, utf8(found ?? 'best guess'));
  finishAdmin(run, forged, 'With the secret, the attacker can sign any token. It is a real signature, so every check passes.', 'A signature from any other key does not match.', 'hmac(secret');
}

function stolenToken({ world, story, token, defended }: Run) {
  story.step({
    title: 'The attacker copies the token',
    why: 'However it happened, the attacker now holds a copy.',
    line: 'user = verify(request.cookies.token)',
    note: { from: 'attacker', to: 'browser', label: 'copies token' },
  });
  world.browser.submit(`${SHOP_ORIGIN}/signout`, {});
  const now = asAttacker(world, '/account', token);
  story.step({
    title: 'alice signs out',
    why: 'The browser drops the token, and the shop has nothing to delete: the token is the session.',
    line: 'if (now >= payload.exp)',
  });
  story.step({
    title: `The attacker uses the copy → ${now}`,
    why: 'The token is still valid, because nothing on the server knows alice signed out.',
    line: 'return payload',
    variables: { status: now },
  });
  world.advance(WAIT);
  const later = asAttacker(world, '/account', token);
  const inside = later === 200;
  story.step({
    title: `${WAIT} s later → ${later}`,
    why: `${defended ? `A ${SHORT_TTL} s expiry ended it, so the stolen copy lasted 5 minutes at most.` : 'A day-long expiry leaves it working for hours yet.'} A session row could be deleted at once, but a token can only wait for its exp.`,
    line: 'if (now >= payload.exp)',
    variables: { seconds: WAIT, result: resultOf(inside) },
  });
}

const ATTACKS: Record<string, { token(on: boolean): NonNullable<ShopOptions['token']>; play(run: Run): void; plan: string }> = {
  'Edit the payload': { token: (verifySignature) => ({ ...DEFAULT_TOKEN, verifySignature }), play: editPayload, plan: 'The defense is verifying the signature.' },
  'alg: none': { token: (fixedAlg) => ({ ...DEFAULT_TOKEN, fixedAlg }), play: algNone, plan: 'The defense is a fixed algorithm.' },
  'Weak secret': { token: (strong) => ({ ...DEFAULT_TOKEN, secret: strong ? TOKEN_SECRET : utf8('secret') }), play: weakSecret, plan: 'The defense is a strong secret.' },
  'Stolen token': { token: (short) => ({ ...DEFAULT_TOKEN, ttl: short ? SHORT_TTL : LONG_TTL }), play: stolenToken, plan: 'The defense is a short expiry.' },
};

export function jsonWebTokensSteps(values: Record<string, string>): Step[] {
  return attackSteps(values, ATTACK_OPTIONS, (attack, defended) => {
    const { token: tokenOptions, play, plan } = ATTACKS[attack]!;
    const world = createWorld([createShop({ token: tokenOptions(defended) })]);
    const story = createStory({ world, code: jsonWebTokensCode, nodes: ['browser', 'attacker', 'shop'] });
    story.step({ title: attack, why: `${plan} It is ${defended ? 'on' : 'off'}.`, next: 'alice signs in and gets a token.', line: 'function verify' });
    world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: ALICE.name, password: ALICE.password });
    const token = world.browser.jar().find((cookie) => cookie.name === 'token')!.value;
    story.step({
      title: 'alice signs in',
      why: 'The shop signs the facts about alice into a token and stores nothing. Any server with the secret can check it.',
      next: 'The attacker holds a copy of this token.',
      line: 'user = verify(request.cookies.token)',
      rows: partsGrid(token, 'token'),
    });
    play({ world, story, defended, token });
    return story.steps;
  });
}
