import { encodeBase64url } from '../crypto/base64url';
import { utf8 } from '../crypto/bytes';
import { signToyRs } from '../crypto/jwt';
import { keyPair } from '../crypto/rsa';
import { sha256 } from '../crypto/sha256';
import { USERS } from './data';
import { cookiesOf, originOf, queryOf, response } from './http';
import { randomHex, type Handler, type Site } from './site';

export const LOGIN_ORIGIN = 'https://login.example';

const ID_TOKEN_TTL = 3600;

/** The provider's signing key: a toy, small enough to read. Real providers publish a 2048-bit key or larger. */
export const PROVIDER_KEY = keyPair(691, 809, 17)!;

export const SHOP_CLIENT = { id: 'shop', redirect: 'https://shop.example/callback' };
export const EVIL_CLIENT = { id: 'evil-app', redirect: 'https://evil.example/cb' };

/** An ordinary account the attacker opened at the provider. */
export const ATTACKER_ACCOUNT = { name: 'eve', password: 'eve-own-password' };

const CLIENTS = [SHOP_CLIENT, EVIL_CLIENT];

export type LoginOptions = { pkce: boolean; exactRedirect: boolean };

export const SAFE_LOGIN: LoginOptions = { pkce: true, exactRedirect: true };

export const s256Challenge = (verifier: string): string => encodeBase64url(sha256(utf8(verifier)));

type Grant = { client: string; name: string; nonce: string; challenge: string };

export function createLogin(overrides: Partial<LoginOptions> = {}): Site {
  const options = { ...SAFE_LOGIN, ...overrides };
  const accounts = [...USERS, ATTACKER_ACCOUNT];
  const sessions = new Map<string, string>();
  const codes = new Map<string, Grant>();
  const accessTokens = new Map<string, string>();

  const signIn: Handler = (request, world) => {
    const { name, password } = request.body;
    if (!accounts.some((account) => account.name === name && account.password === password)) return response(401, 'Wrong name or password.');
    const id = randomHex(world, 16);
    sessions.set(id, name!);
    return response(200, `Signed in at login.example as ${name}.`, { setCookies: [{ name: 'login', value: id, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }] });
  };

  const redirectAllowed = (client: (typeof CLIENTS)[number], uri: string) => (options.exactRedirect ? uri === client.redirect : uri.startsWith(originOf(client.redirect)));

  const authorize: Handler = (request, world) => {
    const { client_id: clientId, redirect_uri: redirectUri = '', state = '', nonce = '', code_challenge: challenge = '' } = queryOf(request.url);
    const client = CLIENTS.find((c) => c.id === clientId);
    if (!client) return response(400, 'Unknown app.');
    if (!redirectAllowed(client, redirectUri)) return response(400, `${redirectUri} is not a registered redirect for ${client.id}.`);
    const name = sessions.get(cookiesOf(request).login ?? '');
    if (!name) return response(401, 'Sign in at login.example first.');
    const code = randomHex(world, 8);
    codes.set(code, { client: client.id, name, nonce, challenge });
    return response(302, '', { redirect: `${redirectUri}?${new URLSearchParams({ code, state })}` });
  };

  const token: Handler = (request, world) => {
    const { code = '', client_id: clientId, code_verifier: verifier = '' } = request.body;
    const grant = codes.get(code);
    if (!grant || grant.client !== clientId) return response(400, 'That code is not valid.');
    if (options.pkce && s256Challenge(verifier) !== grant.challenge) return response(400, 'The code_verifier does not match the code_challenge.');
    codes.delete(code);
    const accessToken = randomHex(world, 16);
    accessTokens.set(accessToken, grant.name);
    const iat = world.now();
    const idToken = signToyRs({ iss: LOGIN_ORIGIN, sub: grant.name, aud: grant.client, nonce: grant.nonce, iat, exp: iat + ID_TOKEN_TTL }, PROVIDER_KEY);
    return response(200, JSON.stringify({ access_token: accessToken, id_token: idToken }));
  };

  const userinfo: Handler = (request) => {
    const name = accessTokens.get((request.headers.authorization ?? '').replace('Bearer ', ''));
    return name ? response(200, JSON.stringify({ sub: name })) : response(401, 'Unknown access token.');
  };

  const jwks: Handler = () => response(200, JSON.stringify({ n: PROVIDER_KEY.n, e: PROVIDER_KEY.e }));

  return {
    origin: LOGIN_ORIGIN,
    party: 'login',
    routes: [
      { method: 'POST', path: '/signin', handler: signIn },
      { method: 'GET', path: '/authorize', handler: authorize },
      { method: 'POST', path: '/token', handler: token },
      { method: 'GET', path: '/userinfo', handler: userinfo },
      { method: 'GET', path: '/jwks', handler: jwks },
    ],
  };
}
