import type { GridView, Step } from '../../types/visualization';
import { hex } from '../crypto/bytes';
import { hotpOffset, totp, totpCounter, totpDigest } from '../crypto/totp';
import { attackSteps } from '../steps';
import { TOTP_SECRET, USERS } from '../web/data';
import { createEvil, EVIL_ORIGIN } from '../web/evil';
import { createShop, PASSKEY_KEY, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, rowsGrid, type NodeId, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const multiFactorAuthCode = `function signIn(name, password) {
  if (!matches(name, password)) return 401
  return mfa == none ? session(full) : session(passwordOnly)
}

function checkCode(session, code) {
  live = code in [totp(now - 30), totp(now), totp(now + 30)]
  if (!live) return 401
  if (oneTime && used.has(code)) return 401
  used.add(code)
  session.level = full
}

function checkPasskey(session, signature) {
  message = 'https://shop.example ' + session.challenge
  if (!verify(signature, message, publicKey)) return 401
  session.level = full
}`;

export const ATTACK_OPTIONS = ['Stolen password', 'Reused code', 'Live phishing relay'];

const ALICE = USERS[0];
const REPLAY_DELAY = 10;

type Run = { world: World; story: Story; defended: boolean };

const asAttacker = (world: World, method: 'GET' | 'POST', path: string, cookie: string, body: Record<string, string> = {}) =>
  world.send({ method, url: `${SHOP_ORIGIN}${path}`, headers: cookie ? { cookie } : {}, body }, 'attacker');

function attackerSignIn(world: World): string {
  const answer = asAttacker(world, 'POST', '/signin', '', { name: ALICE.name, password: ALICE.password });
  const sid = answer.setCookies.find((cookie) => cookie.name === 'sid')?.value ?? '';
  return `sid=${sid}`;
}

function finish({ world, story }: Run, cookie: string, inWhy: string, outWhy: string, line: string) {
  const status = asAttacker(world, 'GET', '/account', cookie).status;
  const inside = status === 200;
  story.step({ title: `The attacker opens /account → ${status}`, why: inside ? inWhy : outWhy, line, variables: { result: resultOf(inside) } });
}

/** How a code comes from the shared secret and the clock. */
function codeGrid(now: number): GridView {
  const digest = totpDigest(TOTP_SECRET, now);
  return rowsGrid([
    { part: 'time', value: now },
    { part: 'counter', value: totpCounter(now) },
    { part: 'offset', value: `${hotpOffset(digest)} of ${hex(digest).slice(0, 4)}…` },
    { part: 'code', value: totp(TOTP_SECRET, now) },
  ], 'totp');
}

function stolenPassword(run: Run) {
  const { world, story, defended } = run;
  const cookie = attackerSignIn(world);
  story.step({
    title: 'The attacker signs in with alice\'s password',
    why: defended ? 'The password is right, but the session stays at level password until a second step passes.' : 'The password came from a leak. It is right, and it is all the shop asks for.',
    line: 'return mfa == none',
    rows: rowsGrid(world.site('shop').db!.rows('sessions'), 'sessions'),
  });
  if (defended) {
    const status = asAttacker(world, 'POST', '/signin/code', cookie, { code: '000000' }).status;
    story.step({ title: `The attacker guesses 000000 → ${status}`, why: 'Three codes are live at once, so one guess has about 3 chances in a million.', line: 'if (!live) return 401' });
  }
  finish(run, cookie, 'One stolen password was the whole sign-in.', 'The attacker has the password but no code, and the code comes from a secret on alice\'s phone.', defended ? 'session.level = full' : 'return mfa == none');
}

function reusedCode(run: Run) {
  const { world, story, defended } = run;
  world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: ALICE.name, password: ALICE.password });
  const code = totp(TOTP_SECRET, world.now());
  world.browser.submit(`${SHOP_ORIGIN}/signin/code`, { code });
  story.step({
    title: `alice types ${code}`,
    why: 'The phone and the shop share a secret. Each works out the HMAC of the current 30 s step, so the codes match. The shop also accepts one step either side, in case the clocks differ. Someone reads the code over alice\'s shoulder.',
    line: 'live = code in',
    variables: { code },
    rows: codeGrid(world.now()),
  });
  world.advance(REPLAY_DELAY);
  const cookie = attackerSignIn(world);
  const status = asAttacker(world, 'POST', '/signin/code', cookie, { code }).status;
  story.step({
    title: `${REPLAY_DELAY} s later the attacker replays it → ${status}`,
    why: defended ? 'The shop remembers codes already used, so this one fails even though it is still in its time window.' : 'The code is still in its time window, and the shop keeps no record of using it.',
    line: 'if (oneTime && used.has(code))',
    variables: { code },
  });
  finish(run, cookie, 'A code inside its window worked twice.', 'A code that works once can\'t be replayed, even seconds later.', 'if (oneTime && used.has(code))');
}

function relay(run: Run) {
  const { world, story, defended } = run;
  story.step({
    title: 'alice opens a look-alike page',
    why: 'A link leads to a sign-in page on evil.example that looks just like the shop.',
    line: 'function signIn',
    note: { from: 'browser', to: 'evil', label: 'opens the page' },
  });
  const code = totp(TOTP_SECRET, world.now());
  const answer = world.browser.submit(`${EVIL_ORIGIN}/phish`, { name: ALICE.name, password: ALICE.password, ...(!defended && { code }) });
  if (defended) {
    story.step({
      title: 'evil.example asks for the passkey',
      why: 'The password reached the shop, which sent a challenge. The page asks the browser to sign it, but the passkey belongs to shop.example and this page is on evil.example, so the browser refuses.',
      line: "message = 'https://shop.example '",
      variables: { signature: world.browser.passkeySign(EVIL_ORIGIN, 'any') ?? 'none' },
    });
    world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: ALICE.name, password: ALICE.password });
    const challenge = world.browser.visit(`${SHOP_ORIGIN}/signin/challenge`).body;
    const signature = world.browser.passkeySign(SHOP_ORIGIN, challenge) ?? 0;
    const status = world.browser.submit(`${SHOP_ORIGIN}/signin/passkey`, { signature: String(signature) }).status;
    story.step({ title: `alice uses the real shop → ${status}`, why: 'On shop.example the same passkey signs without a problem. alice never had to notice the fake page.', line: 'session.level = full', variables: { status } });
  } else {
    story.step({
      title: 'evil.example relays what alice types',
      why: 'alice types the password and a live code. evil.example sends both to the real shop straight away, so the code is still valid.',
      line: 'live = code in',
    });
  }
  finish(run, answer.status === 200 ? `sid=${answer.body}` : '', 'The code was real and fresh. A person can be tricked into typing it anywhere, so TOTP does not stop live phishing.', 'A passkey signs the real origin, so a relay has nothing to relay. A person can be fooled by a page, but the browser can\'t.', 'session.level = full');
}

const ATTACKS: Record<string, { mfa(on: boolean): ShopOptions['mfa']; play(run: Run): void; nodes: NodeId[]; plan: string }> = {
  'Stolen password': { mfa: (on) => (on ? 'totp' : 'none'), play: stolenPassword, nodes: ['browser', 'attacker', 'shop', 'db'], plan: 'The defense is requiring a TOTP code.' },
  'Reused code': { mfa: (on) => (on ? 'totp-once' : 'totp'), play: reusedCode, nodes: ['browser', 'attacker', 'shop'], plan: 'The defense is accepting each code once.' },
  'Live phishing relay': { mfa: (on) => (on ? 'passkey' : 'totp'), play: relay, nodes: ['browser', 'attacker', 'evil', 'shop'], plan: 'The defense is a passkey in place of a typed code.' },
};

export function multiFactorAuthSteps(values: Record<string, string>): Step[] {
  return attackSteps(values, ATTACK_OPTIONS, (attack, defended) => {
    const { mfa, play, nodes, plan } = ATTACKS[attack]!;
    const world = createWorld([createShop({ mfa: mfa(defended) }), createEvil()]);
    world.browser.registerPasskey(SHOP_ORIGIN, PASSKEY_KEY);
    const story = createStory({ world, code: multiFactorAuthCode, nodes });
    story.step({ title: attack, why: `${plan} It is ${defended ? 'on' : 'off'}.`, next: 'A second factor asks for something a stolen password does not bring.', line: 'function signIn' });
    play({ world, story, defended });
    return story.steps;
  });
}
