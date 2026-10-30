import { hex, utf8 } from '../crypto/bytes';
import { hs256Signature, signHs256, splitToken } from '../crypto/jwt';
import { pbkdf2 } from '../crypto/pbkdf2';
import { keyPair, verify } from '../crypto/rsa';
import { sha256 } from '../crypto/sha256';
import { totp } from '../crypto/totp';
import { TOKEN_SECRET, TOTP_SECRET, USERS } from './data';
import { createDb, quote, sql } from './db';
import { cookiesOf, pathOf, response, type SetCookie, type WebRequest, type WebResponse } from './http';
import { randomHex, type Handler, type Route, type Site } from './site';
import type { World } from './world';

export const SHOP_ORIGIN = 'https://shop.example';

/** Real systems run far more; lessons run 100 and scale the cost they report. */
export const ROUNDS = 100;

const MAX_FAILURES = 5;
const IP_ATTEMPTS = 5;
const IP_WINDOW = 60;
const FIRST_GUESSABLE_ID = 1001;
const TOTP_STEP = 30;
const EDITABLE = ['name'];
const USER_COLUMNS = ['name', 'role', 'hash', 'salt'];

/** The browser's passkey. The shop stores only the public half, as it would in real life. */
export const PASSKEY_KEY = keyPair(701, 811, 17)!;

export type Storage = 'plain' | 'sha256' | 'salted' | 'pbkdf2';

export type ShopOptions = {
  users: readonly { name: string; password: string; role: string }[];
  storage: Storage;
  limit: 'none' | 'ip' | 'lockout';
  cookie: { httpOnly: boolean; secure: boolean };
  rotateOnSignIn: boolean;
  randomIds: boolean;
  revokeOnSignOut: boolean;
  token: null | { verifySignature: boolean; fixedAlg: boolean; secret: Uint8Array; ttl: number };
  mfa: 'none' | 'totp' | 'totp-once' | 'passkey';
  access: { ownership: boolean; roleCheck: boolean; allowList: boolean };
  checkState: boolean;
  idToken: { aud: boolean; nonce: boolean; exp: boolean; idTokenOnly: boolean };
};

/** Every control on. A lesson turns one off to show what it stops. */
export const SAFE_SHOP: ShopOptions = {
  users: USERS,
  storage: 'pbkdf2',
  limit: 'lockout',
  cookie: { httpOnly: true, secure: true },
  rotateOnSignIn: true,
  randomIds: true,
  revokeOnSignOut: true,
  token: null,
  mfa: 'none',
  access: { ownership: true, roleCheck: true, allowList: true },
  checkState: true,
  idToken: { aud: true, nonce: true, exp: true, idTokenOnly: true },
};

export const DEFAULT_TOKEN = { verifySignature: true, fixedAlg: true, secret: TOKEN_SECRET, ttl: 300 };

export function hashPassword(password: string, storage: Storage, salt: string): string {
  if (storage === 'plain') return password;
  if (storage === 'pbkdf2') return hex(pbkdf2(utf8(password), utf8(salt), ROUNDS, 32));
  return hex(sha256(utf8(salt + password)));
}

/** A fixed salt per name, so runs repeat. Real salts come from a random generator. */
export const saltFor = (name: string, storage: Storage): string => (storage === 'salted' || storage === 'pbkdf2' ? hex(sha256(utf8(name))).slice(0, 8) : '');

type Account = { name: string; role: string };

export function createShop(overrides: Partial<ShopOptions> = {}): Site {
  const options = { ...SAFE_SHOP, ...overrides };
  const db = createDb(
    options.users.map(({ name, password, role }) => {
      const salt = saltFor(name, options.storage);
      return { name, role, salt, hash: hashPassword(password, options.storage, salt) };
    }),
  );
  const failures = new Map<string, number>();
  const attempts = new Map<string, number[]>();
  const usedCodes = new Set<string>();
  const challenges = new Map<string, string>();
  let nextId = FIRST_GUESSABLE_ID;

  const newId = (world: World) => (options.randomIds ? randomHex(world, 16) : String(nextId++));
  const flags: Partial<SetCookie> = { path: '/', sameSite: 'Lax', ...options.cookie };

  const userNamed = (name: string) => db.query(sql`SELECT * FROM users WHERE name = ${name}`)[0];
  const sessionOf = (request: WebRequest) => db.query(sql`SELECT * FROM sessions WHERE id = ${cookiesOf(request).sid ?? ''}`)[0];

  function tokenAccount(token: string, now: number): Account | null {
    const parts = splitToken(token);
    if (!options.token || !parts) return null;
    const { verifySignature, fixedAlg, secret } = options.token;
    if (fixedAlg && parts.header.alg !== 'HS256') return null;
    // The flaw that alg none exploits: the token itself decides whether it needs a signature.
    const unsigned = !fixedAlg && parts.header.alg === 'none';
    if (verifySignature && !unsigned && hs256Signature(parts.signedPart, secret) !== parts.signature) return null;
    const { sub, role, exp } = parts.payload;
    return typeof exp === 'number' && now < exp ? { name: String(sub), role: String(role) } : null;
  }

  function sessionAccount(request: WebRequest): Account | null {
    const session = sessionOf(request);
    const user = session?.level === 'full' ? userNamed(String(session.name)) : undefined;
    return user ? { name: String(user.name), role: String(user.role) } : null;
  }

  const accountOf = (request: WebRequest, world: World) => (options.token ? tokenAccount(cookiesOf(request).token ?? '', world.now()) : sessionAccount(request));

  /** Every page goes through here, so a page is closed unless it says otherwise. */
  const signedIn =
    (page: (account: Account, request: WebRequest) => WebResponse): Handler =>
    (request, world) => {
      const account = accountOf(request, world);
      return account ? page(account, request) : response(401, 'Sign in first.');
    };

  function refusedByLimit(name: string, ip: string, now: number): WebResponse | null {
    if (options.limit === 'lockout' && (failures.get(name) ?? 0) >= MAX_FAILURES) return response(423, `Account ${name} is locked.`);
    if (options.limit === 'ip') {
      const recent = (attempts.get(ip) ?? []).filter((time) => now - time < IP_WINDOW);
      attempts.set(ip, [...recent, now]);
      if (recent.length >= IP_ATTEMPTS) return response(429, 'Too many attempts from this address.');
    }
    return null;
  }

  function startSession(request: WebRequest, world: World, name: string, role: string): WebResponse {
    if (options.token) {
      const iat = world.now();
      const token = signHs256({ sub: name, role, iat, exp: iat + options.token.ttl }, options.token.secret);
      return response(200, `Signed in as ${name}.`, { setCookies: [{ name: 'token', value: token, ...flags }] });
    }
    const level = options.mfa === 'none' ? 'full' : 'password';
    const id = (!options.rotateOnSignIn && cookiesOf(request).sid) || newId(world);
    db.run(sql`DELETE FROM sessions WHERE id = ${id}`);
    db.run(sql`INSERT INTO sessions (id, name, level) VALUES (${id}, ${name}, ${level})`);
    return response(200, level === 'full' ? `Signed in as ${name}.` : 'Password accepted. Second step needed.', { setCookies: [{ name: 'sid', value: id, ...flags }] });
  }

  const passSecondStep = (id: string) => db.run(sql`UPDATE sessions SET level = ${'full'} WHERE id = ${id}`);

  const signIn: Handler = (request, world) => {
    const { name = '', password = '' } = request.body;
    const refused = refusedByLimit(name, request.headers.ip ?? 'browser', world.now());
    if (refused) return refused;
    const user = userNamed(name);
    if (!user || hashPassword(password, options.storage, String(user.salt)) !== user.hash) {
      failures.set(name, (failures.get(name) ?? 0) + 1);
      return response(401, 'Wrong name or password.');
    }
    failures.delete(name);
    return startSession(request, world, name, String(user.role));
  };

  const checkCode: Handler = (request, world) => {
    const session = sessionOf(request);
    const code = request.body.code ?? '';
    const live = [-1, 0, 1].some((step) => totp(TOTP_SECRET, world.now() + step * TOTP_STEP) === code);
    const used = options.mfa === 'totp-once' && usedCodes.has(code);
    if (!session || !live || used) return response(401, 'That code is not valid.');
    usedCodes.add(code);
    passSecondStep(String(session.id));
    return response(200, `Signed in as ${session.name}.`);
  };

  const challenge: Handler = (request, world) => {
    const session = sessionOf(request);
    if (!session) return response(401, 'Sign in first.');
    const value = randomHex(world, 8);
    challenges.set(String(session.id), value);
    return response(200, value);
  };

  const checkPasskey: Handler = (request) => {
    const session = sessionOf(request);
    const signature = request.body.signature ?? '';
    const expected = session && challenges.get(String(session.id));
    if (!session || !expected || !/^\d+$/.test(signature) || !verify(`${SHOP_ORIGIN} ${expected}`, Number(signature), PASSKEY_KEY)) return response(401, 'That passkey signature is not valid.');
    challenges.delete(String(session.id));
    passSecondStep(String(session.id));
    return response(200, `Signed in as ${session.name}.`);
  };

  const signOut: Handler = (request) => {
    if (options.revokeOnSignOut) db.run(sql`DELETE FROM sessions WHERE id = ${cookiesOf(request).sid ?? ''}`);
    return response(200, 'Signed out.', { setCookies: [{ name: 'sid', value: '', ...flags, maxAge: 0 }, { name: 'token', value: '', ...flags, maxAge: 0 }] });
  };

  const accountPage = signedIn(({ name, role }) => response(200, `Signed in as ${name} (${role}). Links: ${role === 'admin' ? '/orders, /admin' : '/orders'}`));

  const editAccount = signedIn(({ name }, request) => {
    const editable = options.access.allowList ? EDITABLE : USER_COLUMNS;
    for (const [field, value] of Object.entries(request.body)) {
      if (!editable.includes(field)) continue;
      // `field` is on the list above, so it is never learner text in the statement.
      db.run(`UPDATE users SET ${field} = ${quote(value)} WHERE name = ${quote(name)}`);
      if (field === 'name') db.run(sql`UPDATE sessions SET name = ${value} WHERE name = ${name}`);
    }
    return response(200, 'Account saved.');
  });

  const orderPage = signedIn(({ name, role }, request) => {
    const order = db.query(sql`SELECT * FROM orders WHERE id = ${Number(pathOf(request.url).split('/').at(-1))}`)[0];
    if (!order) return response(404, 'No such order.');
    if (options.access.ownership && order.owner !== name && role !== 'admin') return response(403, 'This is not your order.');
    return response(200, `Order ${order.id}: ${order.item}, ${order.total}. Owner: ${order.owner}.`);
  });

  const adminPage = signedIn(({ role }) => {
    if (options.access.roleCheck && role !== 'admin') return response(403, 'Admins only.');
    return response(200, `Users: ${db.rows('users').map((user) => user.name).join(', ')}.`);
  });

  const routes: Route[] = [
    { method: 'POST', path: '/signin', handler: signIn },
    { method: 'POST', path: '/signin/code', handler: checkCode },
    { method: 'GET', path: '/signin/challenge', handler: challenge },
    { method: 'POST', path: '/signin/passkey', handler: checkPasskey },
    { method: 'POST', path: '/signout', handler: signOut },
    { method: 'GET', path: '/account', handler: accountPage },
    { method: 'POST', path: '/account', handler: editAccount },
    { method: 'GET', path: /^\/orders\/\d+$/, handler: orderPage },
    { method: 'GET', path: '/admin', handler: adminPage },
  ];
  return { origin: SHOP_ORIGIN, party: 'shop', routes, db };
}
