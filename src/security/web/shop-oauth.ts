import { splitToken, verifyToyRs } from '../crypto/jwt';
import { sql, type ShopDb } from './db';
import { cookiesOf, queryOf, response, type SetCookie, type WebRequest, type WebResponse } from './http';
import { LOGIN_ORIGIN, s256Challenge, SHOP_CLIENT } from './login';
import type { ShopOptions } from './shop';
import { randomHex, type Handler, type Route } from './site';
import type { World } from './world';

type Context = {
  options: ShopOptions;
  db: ShopDb;
  flags: Partial<SetCookie>;
  startSession(request: WebRequest, world: World, name: string, role: string): WebResponse;
};

type Pending = { state: string; nonce: string; verifier: string };

const parse = (answer: WebResponse) => JSON.parse(answer.body) as Record<string, string>;

/** The shop's half of OAuth and OpenID Connect. `iss` and the signature are always checked. */
export function oauthRoutes({ options, db, flags, startSession }: Context): Route[] {
  const pendings = new Map<string, Pending>();

  /** A first sign-in through the provider opens a shop account. Its empty hash matches no password. */
  function signInAs(request: WebRequest, world: World, name: string): WebResponse {
    const user = db.query(sql`SELECT role FROM users WHERE name = ${name}`)[0];
    if (!user) db.run(sql`INSERT INTO users (name, role, hash, salt) VALUES (${name}, ${'customer'}, ${''}, ${''})`);
    return startSession(request, world, name, String(user?.role ?? 'customer'));
  }

  function refusedClaim(token: string, nonce: string | undefined, world: World): string | null {
    const parts = splitToken(token);
    const key = parse(world.send({ method: 'GET', url: `${LOGIN_ORIGIN}/jwks`, headers: {}, body: {} }, 'shop')) as unknown as { n: number; e: number };
    if (!parts || !verifyToyRs(token, key)) return 'the signature does not match the provider key';
    const { iss, aud, nonce: claimed, exp } = parts.payload;
    if (iss !== LOGIN_ORIGIN) return `iss is ${iss}, not ${LOGIN_ORIGIN}`;
    if (options.idToken.aud && aud !== SHOP_CLIENT.id) return `aud is ${aud}, not ${SHOP_CLIENT.id}`;
    if (options.idToken.nonce && claimed !== nonce) return `nonce is ${claimed}, which this shop is not waiting for`;
    if (options.idToken.exp && !(typeof exp === 'number' && world.now() < exp)) return `exp ${exp} has passed`;
    return null;
  }

  function signInWithIdToken(request: WebRequest, world: World, token: string, pending: Pending | undefined): WebResponse {
    const refused = refusedClaim(token, pending?.nonce, world);
    if (refused) return response(401, `ID token refused: ${refused}.`);
    pendings.delete(cookiesOf(request).oauth ?? '');
    return signInAs(request, world, String(splitToken(token)!.payload.sub));
  }

  const start: Handler = (_, world) => {
    const pending = { state: randomHex(world, 8), nonce: randomHex(world, 8), verifier: randomHex(world, 32) };
    const id = randomHex(world, 8);
    pendings.set(id, pending);
    const query = new URLSearchParams({ client_id: SHOP_CLIENT.id, redirect_uri: SHOP_CLIENT.redirect, state: pending.state, nonce: pending.nonce, code_challenge: s256Challenge(pending.verifier) });
    return response(302, '', { redirect: `${LOGIN_ORIGIN}/authorize?${query}`, setCookies: [{ name: 'oauth', value: id, ...flags, httpOnly: true }] });
  };

  const callback: Handler = (request, world) => {
    const { code = '', state } = queryOf(request.url);
    const pending = pendings.get(cookiesOf(request).oauth ?? '');
    if (options.checkState && (!pending || pending.state !== state)) return response(400, 'The state does not match this browser.');
    const exchange = world.send({ method: 'POST', url: `${LOGIN_ORIGIN}/token`, headers: {}, body: { code, client_id: SHOP_CLIENT.id, code_verifier: pending?.verifier ?? '' } }, 'shop');
    if (exchange.status !== 200) return response(400, `The provider refused the code: ${exchange.body}`);
    return signInWithIdToken(request, world, parse(exchange).id_token!, pending);
  };

  const idToken: Handler = (request, world) => signInWithIdToken(request, world, request.body.id_token ?? '', pendings.get(cookiesOf(request).oauth ?? ''));

  const accessToken: Handler = (request, world) => {
    if (options.idToken.idTokenOnly) return response(401, 'An access token is not proof of sign-in. Send an ID token.');
    const info = world.send({ method: 'GET', url: `${LOGIN_ORIGIN}/userinfo`, headers: { authorization: `Bearer ${request.body.access_token ?? ''}` }, body: {} }, 'shop');
    return info.status === 200 ? signInAs(request, world, parse(info).sub!) : response(401, 'The provider does not know that access token.');
  };

  return [
    { method: 'GET', path: '/signin/provider', handler: start },
    { method: 'GET', path: '/callback', handler: callback },
    { method: 'POST', path: '/signin/id-token', handler: idToken },
    { method: 'POST', path: '/signin/access-token', handler: accessToken },
  ];
}
