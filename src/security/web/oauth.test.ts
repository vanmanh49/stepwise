import { describe, expect, it } from 'vitest';
import { signToyRs, splitToken } from '../crypto/jwt';
import { keyPair } from '../crypto/rsa';
import { totp } from '../crypto/totp';
import { TOTP_SECRET } from './data';
import { createEvil, evilInbox, EVIL_ORIGIN } from './evil';
import { queryOf, type WebResponse } from './http';
import { ATTACKER_ACCOUNT, createLogin, EVIL_CLIENT, LOGIN_ORIGIN, PROVIDER_KEY, s256Challenge, SHOP_CLIENT, type LoginOptions } from './login';
import { createShop, PASSKEY_KEY, SAFE_SHOP, SHOP_ORIGIN, type ShopOptions } from './shop';
import { createWorld, type World } from './world';

function setup(shop: Partial<ShopOptions> = {}, login: Partial<LoginOptions> = {}) {
  const world = createWorld([createShop(shop), createLogin(login), createEvil()]);
  world.browser.submit(`${LOGIN_ORIGIN}/signin`, { name: 'alice', password: 'sunshine' });
  return world;
}

const post = (world: World, url: string, body: Record<string, string>, cookie?: string) =>
  world.send({ method: 'POST', url, headers: cookie ? { cookie } : {}, body }, 'attacker');

const json = (answer: WebResponse) => JSON.parse(answer.body) as Record<string, string>;

const authorizeUrl = (query: Record<string, string>) => `${LOGIN_ORIGIN}/authorize?${new URLSearchParams(query)}`;

const shopAuthorize = (extra: Record<string, string> = {}) => authorizeUrl({ client_id: SHOP_CLIENT.id, redirect_uri: SHOP_CLIENT.redirect, state: 's', nonce: 'n', code_challenge: s256Challenge('v'), ...extra });

/** Signs alice in at the provider, then stops short of the app so the code is still unused. */
const codeFrom = (world: World, url: string) => queryOf(world.browser.visit(url, undefined, SHOP_ORIGIN).redirect ?? '').code ?? '';

const claims = (extra: Record<string, unknown> = {}, world?: World) => ({ iss: LOGIN_ORIGIN, sub: 'alice', aud: 'shop', nonce: 'n', iat: 0, exp: (world?.now() ?? 0) + 3600, ...extra });

const allOn = SAFE_SHOP.idToken;

describe('PKCE', () => {
  it('matches RFC 7636 appendix B', () => {
    expect(s256Challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('the whole flow', () => {
  it('signs alice in on the shop with a real id_token', () => {
    const world = setup();
    expect(world.browser.visit(`${SHOP_ORIGIN}/signin/provider`).status).toBe(200);
    expect(world.browser.visit(`${SHOP_ORIGIN}/account`).body).toContain('alice');
    const token = world.events.find((e) => e.request.url.endsWith('/token'))!;
    const parts = splitToken(json(token.response).id_token!)!;
    expect(parts.header.alg).toBe('TOY-RS');
    expect(parts.payload).toMatchObject({ iss: LOGIN_ORIGIN, sub: 'alice', aud: 'shop' });
    expect(parts.payload.exp).toBe((parts.payload.iat as number) + 3600);
  });

  it('asks for a provider sign-in first', () => {
    const world = createWorld([createShop(), createLogin(), createEvil()]);
    expect(world.browser.visit(shopAuthorize()).status).toBe(401);
  });

  it('refuses an unknown app', () => {
    const world = setup();
    expect(world.browser.visit(shopAuthorize({ client_id: 'nobody' })).status).toBe(400);
  });

  it('refuses a wrong provider password', () => {
    const world = setup();
    expect(post(world, `${LOGIN_ORIGIN}/signin`, { name: 'alice', password: 'no' }).status).toBe(401);
  });

  it('gives a new user a shop account', () => {
    const world = createWorld([createShop(), createLogin(), createEvil()]);
    world.browser.submit(`${LOGIN_ORIGIN}/signin`, ATTACKER_ACCOUNT);
    world.browser.visit(`${SHOP_ORIGIN}/signin/provider`);
    expect(world.browser.visit(`${SHOP_ORIGIN}/account`).body).toContain(ATTACKER_ACCOUNT.name);
  });

  it('answers /jwks with the public key', () => {
    const world = setup();
    expect(json(world.send({ method: 'GET', url: `${LOGIN_ORIGIN}/jwks`, headers: {}, body: {} }, 'shop'))).toEqual({ n: PROVIDER_KEY.n, e: PROVIDER_KEY.e });
  });
});

describe('/token', () => {
  const redeem = (world: World, code: string, extra: Record<string, string> = {}) => post(world, `${LOGIN_ORIGIN}/token`, { code, client_id: SHOP_CLIENT.id, ...extra });

  it('gives tokens with no verifier when pkce is off', () => {
    const world = setup({}, { pkce: false });
    expect(redeem(world, codeFrom(world, shopAuthorize())).status).toBe(200);
  });

  it.each([
    ['no verifier', {}, 400],
    ['a wrong verifier', { code_verifier: 'x' }, 400],
    ['the right verifier', { code_verifier: 'v' }, 200],
  ])('with pkce on, %s gives the right status', (_name, extra, status) => {
    const world = setup({}, { pkce: true });
    expect(redeem(world, codeFrom(world, shopAuthorize()), extra).status).toBe(status);
  });

  it('accepts a code once', () => {
    const world = setup();
    const code = codeFrom(world, shopAuthorize());
    redeem(world, code, { code_verifier: 'v' });
    expect(redeem(world, code, { code_verifier: 'v' }).status).toBe(400);
  });

  it('refuses a code for another app', () => {
    const world = setup({}, { pkce: false });
    const code = codeFrom(world, shopAuthorize());
    expect(post(world, `${LOGIN_ORIGIN}/token`, { code, client_id: EVIL_CLIENT.id }).status).toBe(400);
  });
});

describe('redirect matching', () => {
  const tampered = 'https://shop.example.evil.example/cb';

  it('sends the code to a lookalike with exactRedirect off', () => {
    const world = setup({}, { exactRedirect: false });
    world.browser.visit(shopAuthorize({ redirect_uri: tampered }));
    expect(evilInbox(world)).toHaveLength(1);
  });

  it('refuses it with exactRedirect on', () => {
    const world = setup({}, { exactRedirect: true });
    expect(world.browser.visit(shopAuthorize({ redirect_uri: tampered })).status).toBe(400);
    expect(evilInbox(world)).toEqual([]);
  });

  it('refuses another site even with exactRedirect off', () => {
    const world = setup({}, { exactRedirect: false });
    expect(world.browser.visit(shopAuthorize({ redirect_uri: `${EVIL_ORIGIN}/cb` })).status).toBe(400);
  });
});

describe('/callback', () => {
  const attackerCode = (world: World) => {
    const signin = post(world, `${LOGIN_ORIGIN}/signin`, ATTACKER_ACCOUNT);
    const cookie = `login=${signin.setCookies[0]!.value}`;
    const answer = world.send({ method: 'GET', url: shopAuthorize(), headers: { cookie }, body: {} }, 'attacker');
    return queryOf(answer.redirect!).code!;
  };

  it('signs the browser in as the attacker with checkState off', () => {
    const world = setup({ checkState: false, idToken: { ...allOn, nonce: false } }, { pkce: false });
    expect(world.browser.visit(`${SHOP_ORIGIN}/callback?code=${attackerCode(world)}&state=x`, EVIL_ORIGIN).status).toBe(200);
    expect(world.browser.visit(`${SHOP_ORIGIN}/account`).body).toContain(ATTACKER_ACCOUNT.name);
  });

  it('refuses a mismatched state with checkState on', () => {
    const world = setup({ checkState: true }, { pkce: false });
    expect(world.browser.visit(`${SHOP_ORIGIN}/callback?code=${attackerCode(world)}&state=x`, EVIL_ORIGIN).status).toBe(400);
    expect(world.browser.jar().some((c) => c.name === 'sid')).toBe(false);
  });
});

describe('/signin/id-token', () => {
  const send = (world: World, token: string, cookie?: string) => post(world, `${SHOP_ORIGIN}/signin/id-token`, { id_token: token }, cookie).status;

  /** A flow the shop started, so it holds a nonce to compare. */
  const pending = (world: World) => {
    const answer = world.send({ method: 'GET', url: `${SHOP_ORIGIN}/signin/provider`, headers: {}, body: {} }, 'attacker');
    return { cookie: `oauth=${answer.setCookies[0]!.value}`, nonce: queryOf(answer.redirect!).nonce! };
  };

  it.each([
    [false, 200],
    [true, 401],
  ])('a token for another app with aud %s gives %i', (aud, status) => {
    const world = setup({ idToken: { ...allOn, aud } });
    const { cookie, nonce } = pending(world);
    expect(send(world, signToyRs(claims({ aud: EVIL_CLIENT.id, nonce }, world), PROVIDER_KEY), cookie)).toBe(status);
  });

  it.each([
    [false, 200],
    [true, 401],
  ])('a reused nonce with nonce %s gives %i', (nonce, status) => {
    const world = setup({ idToken: { ...allOn, nonce } });
    expect(send(world, signToyRs(claims({ nonce: 'used-before' }, world), PROVIDER_KEY))).toBe(status);
  });

  it.each([
    [false, 200],
    [true, 401],
  ])('a token past exp with exp %s gives %i', (exp, status) => {
    const world = setup({ idToken: { ...allOn, nonce: false, exp } });
    expect(send(world, signToyRs(claims({ exp: world.now() - 1 }), PROVIDER_KEY))).toBe(status);
  });

  it('refuses a token at the exact second of exp', () => {
    const world = setup({ idToken: { ...allOn, nonce: false } });
    expect(send(world, signToyRs(claims({ exp: world.now() }), PROVIDER_KEY))).toBe(401);
  });

  it('uses a nonce once', () => {
    const world = setup();
    const { cookie, nonce } = pending(world);
    const token = signToyRs(claims({ nonce }, world), PROVIDER_KEY);
    expect(send(world, token, cookie)).toBe(200);
    expect(send(world, token, cookie)).toBe(401);
  });

  it('names the claim that failed', () => {
    const world = setup({ idToken: { ...allOn, nonce: false } });
    const answer = post(world, `${SHOP_ORIGIN}/signin/id-token`, { id_token: signToyRs(claims({ aud: EVIL_CLIENT.id }, world), PROVIDER_KEY) });
    expect(answer.body).toContain('aud');
  });

  describe.each([
    ['all off', { aud: false, nonce: false, exp: false, idTokenOnly: false }],
    ['all on', allOn],
  ])('with the claim checks %s', (_name, idToken) => {
    it('refuses a changed payload', () => {
      const world = setup({ idToken });
      const [header, , signature] = signToyRs(claims({}, world), PROVIDER_KEY).split('.');
      const other = signToyRs(claims({ sub: 'root' }, world), PROVIDER_KEY).split('.')[1];
      expect(send(world, `${header}.${other}.${signature}`)).toBe(401);
    });

    it('refuses another issuer', () => {
      const world = setup({ idToken });
      expect(send(world, signToyRs(claims({ iss: 'https://evil.example' }, world), PROVIDER_KEY))).toBe(401);
    });

    it("refuses another provider's key", () => {
      const world = setup({ idToken });
      expect(send(world, signToyRs(claims({}, world), keyPair(701, 811, 17)!))).toBe(401);
    });

    it('refuses garbage', () => {
      const world = setup({ idToken });
      expect(send(world, 'abc')).toBe(401);
    });
  });
});

describe('/signin/access-token', () => {
  const accessToken = (world: World) => {
    const code = queryOf(world.browser.visit(authorizeUrl({ client_id: EVIL_CLIENT.id, redirect_uri: EVIL_CLIENT.redirect }), undefined, EVIL_ORIGIN).redirect!).code!;
    return json(post(world, `${LOGIN_ORIGIN}/token`, { code, client_id: EVIL_CLIENT.id })).access_token!;
  };

  it('signs in through /userinfo with idTokenOnly off', () => {
    const world = setup({ idToken: { ...allOn, idTokenOnly: false } }, { pkce: false });
    const answer = post(world, `${SHOP_ORIGIN}/signin/access-token`, { access_token: accessToken(world) });
    expect(answer.status).toBe(200);
    expect(answer.setCookies[0]!.name).toBe('sid');
    expect(world.events.some((e) => e.request.url.endsWith('/userinfo'))).toBe(true);
  });

  it('refuses with idTokenOnly on', () => {
    const world = setup({}, { pkce: false });
    expect(post(world, `${SHOP_ORIGIN}/signin/access-token`, { access_token: accessToken(world) }).status).toBe(401);
  });

  it('refuses a token /userinfo does not know', () => {
    const world = setup({ idToken: { ...allOn, idTokenOnly: false } });
    expect(post(world, `${SHOP_ORIGIN}/signin/access-token`, { access_token: 'nope' }).status).toBe(401);
  });
});

describe('the attacker site', () => {
  it('keeps the codes that reach it', () => {
    const world = setup();
    world.browser.visit(`${EVIL_ORIGIN}/cb?code=abc`);
    expect(evilInbox(world)).toEqual(['abc']);
  });

  const relayWorld = (mfa: ShopOptions['mfa']) => createWorld([createShop({ mfa }), createLogin(), createEvil()]);

  it('relays a live code and keeps the session', () => {
    const world = relayWorld('totp');
    const answer = world.browser.submit(`${EVIL_ORIGIN}/phish`, { name: 'alice', password: 'sunshine', code: totp(TOTP_SECRET, world.now()) });
    expect(answer.status).toBe(200);
    expect(post(world, `${SHOP_ORIGIN}/signout`, {}, `sid=${answer.body}`).status).toBe(200);
  });

  it('reports a code the shop refused', () => {
    const world = relayWorld('totp');
    expect(world.browser.submit(`${EVIL_ORIGIN}/phish`, { name: 'alice', password: 'sunshine', code: 'bad' }).status).toBe(401);
  });

  it('gets no passkey signature on its own origin', () => {
    const world = relayWorld('passkey');
    world.browser.registerPasskey(SHOP_ORIGIN, PASSKEY_KEY);
    const answer = world.browser.submit(`${EVIL_ORIGIN}/phish`, { name: 'alice', password: 'sunshine' });
    expect(answer.status).toBe(401);
    expect(answer.body).toContain('evil.example');
  });
});
