import { describe, expect, it } from 'vitest';
import { hex, utf8 } from '../crypto/bytes';
import { hs256Signature, signHs256, splitToken, unsignedToken } from '../crypto/jwt';
import { pbkdf2 } from '../crypto/pbkdf2';
import { sha256 } from '../crypto/sha256';
import { totp } from '../crypto/totp';
import { TOKEN_SECRET, TOTP_SECRET } from './data';
import { blockedInput, hashPassword, createShop, PASSKEY_KEY, ROUNDS, SAFE_SHOP, type ShopOptions } from './shop';
import { createWorld, type World } from './world';

const SHOP = 'https://shop.example';

function setup(overrides: Partial<ShopOptions> = {}) {
  const site = createShop(overrides);
  const world = createWorld([site]);
  const signIn = (name = 'alice', password = 'sunshine') => world.browser.submit(`${SHOP}/signin`, { name, password });
  return { site, world, db: site.db!, signIn };
}

const attempt = (world: World, name: string, password: string, ip = '10.0.0.1') =>
  world.send({ method: 'POST', url: `${SHOP}/signin`, headers: { ip }, body: { name, password } }, 'attacker').status;

const asAttacker = (world: World, path: string, cookie: string) => world.send({ method: 'GET', url: `${SHOP}${path}`, headers: { cookie }, body: {} }, 'attacker');

describe('hashPassword', () => {
  it('uses SHA-256 for sha256', () => {
    expect(hashPassword('sunshine', 'sha256', '')).toBe(hex(sha256(utf8('sunshine'))));
  });

  it('keeps plain text as it is', () => {
    expect(hashPassword('sunshine', 'plain', '')).toBe('sunshine');
  });

  it('gives two salts two hashes', () => {
    expect(hashPassword('sunshine', 'salted', 'a')).not.toBe(hashPassword('sunshine', 'salted', 'b'));
  });

  it('runs PBKDF2 for ROUNDS rounds', () => {
    expect(ROUNDS).toBe(100);
    expect(hashPassword('sunshine', 'pbkdf2', 'a')).toBe(hex(pbkdf2(utf8('sunshine'), utf8('a'), ROUNDS, 32)));
  });
});

describe('signing in', () => {
  it('gives a session with the right password', () => {
    const { world, db, signIn } = setup();
    expect(signIn().status).toBe(200);
    const sid = world.browser.jar().find((c) => c.name === 'sid')!;
    expect(db.rows('sessions')).toEqual([{ id: sid.value, name: 'alice', level: 'full' }]);
    expect(world.browser.visit(`${SHOP}/account`).status).toBe(200);
  });

  it('gives nothing with the wrong password', () => {
    const { world, db, signIn } = setup();
    expect(signIn('alice', 'wrong').status).toBe(401);
    expect(world.browser.jar()).toEqual([]);
    expect(db.rows('sessions')).toEqual([]);
  });

  it('survives a name with a quote mark', () => {
    const { signIn } = setup({ users: [{ name: "o'brien", password: 'pw', role: 'customer' }] });
    expect(signIn("o'brien", 'pw').status).toBe(200);
    expect(signIn("' OR 1=1 --", 'pw').status).toBe(401);
  });

  it('applies the cookie flags', () => {
    const { world, signIn } = setup({ cookie: { httpOnly: false, secure: false } });
    signIn();
    expect(world.browser.jar()[0]).toMatchObject({ httpOnly: false, secure: false, sameSite: 'Lax' });
  });

  it('refuses the account page with no session', () => {
    const { world } = setup();
    expect(world.browser.visit(`${SHOP}/account`).status).toBe(401);
  });
});

describe('session ids', () => {
  it('keeps a planted id with rotateOnSignIn off', () => {
    const { world, signIn } = setup({ rotateOnSignIn: false });
    world.browser.plant(`${SHOP}/`, { name: 'sid', value: 'planted' });
    signIn();
    expect(world.browser.jar()[0]!.value).toBe('planted');
    expect(asAttacker(world, '/account', 'sid=planted').status).toBe(200);
  });

  it('replaces a planted id with rotateOnSignIn on', () => {
    const { world, signIn } = setup({ rotateOnSignIn: true });
    world.browser.plant(`${SHOP}/`, { name: 'sid', value: 'planted' });
    signIn();
    expect(world.browser.jar()[0]!.value).not.toBe('planted');
    expect(asAttacker(world, '/account', 'sid=planted').status).toBe(401);
  });

  it('counts from 1001 with randomIds off', () => {
    const { world, signIn } = setup({ randomIds: false });
    signIn();
    expect(world.browser.jar()[0]!.value).toBe('1001');
    signIn('bob');
    expect(world.browser.jar()[0]!.value).toBe('1002');
  });

  it('uses 16 random bytes with randomIds on', () => {
    const { world, signIn } = setup({ randomIds: true });
    signIn();
    expect(world.browser.jar()[0]!.value).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('signing out', () => {
  it.each([
    [true, 401, 0],
    [false, 200, 1],
  ])('with revokeOnSignOut %s the old id gives %i', (revokeOnSignOut, status, rows) => {
    const { world, db, signIn } = setup({ revokeOnSignOut });
    signIn();
    const copy = world.browser.jar()[0]!.value;
    world.browser.submit(`${SHOP}/signout`, {});
    expect(world.browser.jar()).toEqual([]);
    expect(db.rows('sessions')).toHaveLength(rows);
    expect(asAttacker(world, '/account', `sid=${copy}`).status).toBe(status);
  });
});

describe('limits', () => {
  it('locks an account after 5 failures, even for the right password', () => {
    const { world } = setup({ limit: 'lockout' });
    for (let i = 0; i < 5; i++) expect(attempt(world, 'alice', 'wrong')).toBe(401);
    expect(attempt(world, 'alice', 'sunshine')).toBe(423);
  });

  it('forgets failures after a success', () => {
    const { world } = setup({ limit: 'lockout' });
    for (let i = 0; i < 4; i++) attempt(world, 'alice', 'wrong');
    expect(attempt(world, 'alice', 'sunshine')).toBe(200);
    for (let i = 0; i < 4; i++) attempt(world, 'alice', 'wrong');
    expect(attempt(world, 'alice', 'sunshine')).toBe(200);
  });

  it('limits one address to 5 attempts in 60 s', () => {
    const { world } = setup({ limit: 'ip' });
    for (let i = 0; i < 5; i++) expect(attempt(world, 'alice', 'wrong')).toBe(401);
    expect(attempt(world, 'alice', 'sunshine')).toBe(429);
    world.advance(60);
    expect(attempt(world, 'alice', 'sunshine')).toBe(200);
  });

  it('does not count another address', () => {
    const { world } = setup({ limit: 'ip' });
    for (let i = 0; i < 5; i++) attempt(world, 'alice', 'wrong');
    expect(attempt(world, 'alice', 'sunshine', '10.0.0.2')).toBe(200);
  });

  it('allows every attempt with no limit', () => {
    const { world } = setup({ limit: 'none' });
    for (let i = 0; i < 10; i++) attempt(world, 'alice', 'wrong');
    expect(attempt(world, 'alice', 'sunshine')).toBe(200);
  });
});

describe('tokens', () => {
  const token = { verifySignature: true, fixedAlg: true, secret: TOKEN_SECRET, ttl: 300 };
  const signedIn = (extra: Partial<NonNullable<ShopOptions['token']>> = {}) => {
    const context = setup({ token: { ...token, ...extra } });
    context.signIn();
    const value = context.world.browser.jar().find((c) => c.name === 'token')!.value;
    return { ...context, value, parts: splitToken(value)! };
  };

  it('signs a token in place of a session', () => {
    const { world, db, parts } = signedIn();
    expect(parts.payload).toMatchObject({ sub: 'alice', role: 'customer', exp: parts.payload.iat as number + 300 });
    expect(db.rows('sessions')).toEqual([]);
    expect(world.browser.visit(`${SHOP}/account`).status).toBe(200);
  });

  it.each([
    [false, 200],
    [true, 401],
  ])('an edited payload with verifySignature %s gives %i', (verifySignature, status) => {
    const { world, parts, value } = signedIn({ verifySignature });
    const edited = signHs256({ ...parts.payload, role: 'admin' }, utf8('not the secret'));
    expect(asAttacker(world, '/account', `token=${edited}`).status).toBe(status);
    expect(value).not.toBe(edited);
  });

  it.each([
    [false, 200],
    [true, 401],
  ])('alg none with fixedAlg %s gives %i', (fixedAlg, status) => {
    const { world, parts } = signedIn({ fixedAlg });
    expect(asAttacker(world, '/account', `token=${unsignedToken(parts.payload)}`).status).toBe(status);
  });

  it('accepts a token signed with the secret', () => {
    const { world, parts } = signedIn();
    expect(asAttacker(world, '/account', `token=${parts.signedPart}.${hs256Signature(parts.signedPart, TOKEN_SECRET)}`).status).toBe(200);
  });

  it('refuses a token at the exact second it expires', () => {
    const { world, value } = signedIn();
    world.advance(299);
    expect(asAttacker(world, '/account', `token=${value}`).status).toBe(200);
    world.advance(1);
    expect(asAttacker(world, '/account', `token=${value}`).status).toBe(401);
  });

  it('refuses garbage', () => {
    const { world } = signedIn();
    expect(asAttacker(world, '/account', 'token=abc').status).toBe(401);
  });
});

describe('second factors', () => {
  const code = (world: World, seconds = 0) => totp(TOTP_SECRET, world.now() + seconds);
  const submitCode = (world: World, value: string) => world.browser.submit(`${SHOP}/signin/code`, { code: value }).status;

  it('holds a session back until the code arrives', () => {
    const { world, db, signIn } = setup({ mfa: 'totp' });
    signIn();
    expect(db.rows('sessions')[0]!.level).toBe('password');
    expect(world.browser.visit(`${SHOP}/account`).status).toBe(401);
    expect(submitCode(world, code(world))).toBe(200);
    expect(world.browser.visit(`${SHOP}/account`).status).toBe(200);
  });

  it('accepts the previous step and refuses two steps ago', () => {
    const { world, signIn } = setup({ mfa: 'totp' });
    signIn();
    expect(submitCode(world, code(world, -60))).toBe(401);
    expect(submitCode(world, code(world, -30))).toBe(200);
  });

  it('lets a plain TOTP code be used twice, but not a one-time code', () => {
    const plain = setup({ mfa: 'totp' });
    plain.signIn();
    submitCode(plain.world, code(plain.world));
    plain.signIn('bob');
    expect(submitCode(plain.world, code(plain.world))).toBe(200);

    const once = setup({ mfa: 'totp-once' });
    once.signIn();
    submitCode(once.world, code(once.world));
    once.signIn('bob');
    expect(submitCode(once.world, code(once.world))).toBe(401);
  });

  it('remembers a one-time code into the next 30 s step', () => {
    const { world, signIn } = setup({ mfa: 'totp-once' });
    signIn();
    const value = code(world);
    submitCode(world, value);
    world.advance(30);
    signIn('bob');
    expect(submitCode(world, value)).toBe(401);
  });

  it('needs a password first', () => {
    const { world } = setup({ mfa: 'totp' });
    expect(submitCode(world, code(world))).toBe(401);
  });

  it('accepts a passkey signature over its challenge', () => {
    const { world, signIn } = setup({ mfa: 'passkey' });
    world.browser.registerPasskey(SHOP, PASSKEY_KEY);
    signIn();
    const challenge = world.browser.visit(`${SHOP}/signin/challenge`).body;
    const signature = world.browser.passkeySign(SHOP, challenge)!;
    expect(world.browser.submit(`${SHOP}/signin/passkey`, { signature: String(signature) }).status).toBe(200);
    expect(world.browser.visit(`${SHOP}/account`).status).toBe(200);
  });

  it('refuses a wrong passkey signature', () => {
    const { world, signIn } = setup({ mfa: 'passkey' });
    signIn();
    world.browser.visit(`${SHOP}/signin/challenge`);
    expect(world.browser.submit(`${SHOP}/signin/passkey`, { signature: '1' }).status).toBe(401);
    expect(world.browser.submit(`${SHOP}/signin/passkey`, { signature: 'abc' }).status).toBe(401);
  });
});

describe('access control', () => {
  const access = { ownership: true, roleCheck: true, allowList: true };

  it.each([
    [false, 200],
    [true, 403],
  ])("reading someone else's order with ownership %s gives %i", (ownership, status) => {
    const { world, signIn } = setup({ access: { ...access, ownership } });
    signIn();
    expect(world.browser.visit(`${SHOP}/orders/102`).status).toBe(status);
    expect(world.browser.visit(`${SHOP}/orders/101`).status).toBe(200);
  });

  it('gives 404 for an order that does not exist', () => {
    const { world, signIn } = setup();
    signIn();
    expect(world.browser.visit(`${SHOP}/orders/999`).status).toBe(404);
  });

  it.each([
    [false, 200],
    [true, 403],
  ])('the admin page with roleCheck %s gives %i', (roleCheck, status) => {
    const { world, signIn } = setup({ access: { ...access, roleCheck } });
    signIn();
    expect(world.browser.visit(`${SHOP}/admin`).status).toBe(status);
  });

  it('lets an admin in, and shows the link only to an admin', () => {
    const { world, signIn } = setup();
    signIn('root', 'dragon');
    expect(world.browser.visit(`${SHOP}/admin`).status).toBe(200);
    expect(world.browser.visit(`${SHOP}/account`).body).toContain('/admin');
    signIn();
    expect(world.browser.visit(`${SHOP}/account`).body).not.toContain('/admin');
  });

  it.each([
    [false, 'admin'],
    [true, 'customer'],
  ])('posting role=admin with allowList %s leaves the role %s', (allowList, role) => {
    const { world, db, signIn } = setup({ access: { ...access, allowList } });
    signIn();
    world.browser.submit(`${SHOP}/account`, { role: 'admin' });
    expect(db.rows('users').find((u) => u.name === 'alice')!.role).toBe(role);
  });

  it('still lets a name be edited, and keeps the session', () => {
    const { world, db, signIn } = setup();
    signIn();
    world.browser.submit(`${SHOP}/account`, { name: 'alice2' });
    expect(db.rows('users')[0]!.name).toBe('alice2');
    expect(world.browser.visit(`${SHOP}/account`).status).toBe(200);
  });

  it('needs a session for every page', () => {
    const { world } = setup();
    for (const path of ['/account', '/orders/101', '/admin']) expect(world.browser.visit(`${SHOP}${path}`).status).toBe(401);
    expect(world.browser.submit(`${SHOP}/account`, { role: 'admin' }).status).toBe(401);
  });

  it('starts safe', () => {
    expect(SAFE_SHOP.access).toEqual(access);
    expect(SAFE_SHOP.rotateOnSignIn && SAFE_SHOP.randomIds && SAFE_SHOP.revokeOnSignOut && SAFE_SHOP.checkState).toBe(true);
  });
});

describe('injection routes', () => {
  const get = (world: World, path: string) => world.send({ method: 'GET', url: `${SHOP}${path}`, headers: {}, body: {} }, 'browser');
  const search = (world: World, q: string) => get(world, `/search?q=${encodeURIComponent(q)}`);
  const ping = (world: World, host: string) => get(world, `/ping?host=${encodeURIComponent(host)}`);
  /** Sent raw, as an address bar sends it: `%` stays, and the server decodes once. */
  const download = (world: World, file: string) => get(world, `/download?file=${file}`);
  const string = { storage: 'sha256', limit: 'none', queries: 'string' } as const;
  const blocklist = { ...string, queries: 'blocklist' } as const;
  const parameters = { ...string, queries: 'parameters' } as const;
  const signInAs = (shop: Partial<ShopOptions>, name: string) => {
    const { world } = setup(shop);
    return world.browser.submit(`${SHOP}/signin`, { name, password: 'wrong' });
  };

  describe('POST /signin', () => {
    it.each<[Partial<ShopOptions>, string, number, string]>([
      [string, "alice' --", 200, 'Signed in as alice.'],
      [string, "' or 1=1 or '", 200, 'Signed in as alice.'],
      [blocklist, "' or 1=1 or '", 200, 'Signed in as alice.'],
      [blocklist, "alice' --", 400, 'refused'],
      [parameters, "alice' --", 401, 'Wrong name'],
      [parameters, "' or 1=1 or '", 401, 'Wrong name'],
      [string, 'alice', 401, 'Wrong name'],
      [blocklist, 'alice', 401, 'Wrong name'],
      [parameters, 'alice', 401, 'Wrong name'],
    ])('%o with %s', (shop, name, status, text) => {
      const answer = signInAs(shop, name);
      expect(answer.status).toBe(status);
      expect(answer.body).toContain(text);
    });

    it('gives a 500 with the interpreter message for a stray quote', () => {
      const answer = signInAs(string, "'");
      expect(answer.status).toBe(500);
      expect(answer.body).toContain('SQL error');
    });

    it('records the statement it ran', () => {
      const { site, world } = setup(string);
      world.browser.submit(`${SHOP}/signin`, { name: "alice' --", password: 'wrong' });
      expect(site.trace!.at(-1)).toBe(`SELECT * FROM users WHERE name = 'alice' --' AND hash = '${hashPassword('wrong', 'sha256', '')}'`);
    });

    it('records the quoted statement with parameters', () => {
      const { site, world } = setup(parameters);
      world.browser.submit(`${SHOP}/signin`, { name: "alice' --", password: 'wrong' });
      expect(site.trace!.at(-1)).toBe("SELECT * FROM users WHERE name = 'alice'' --'");
    });

    it('still signs in with the right password under string', () => {
      expect(setup(string).signIn().status).toBe(200);
    });
  });

  describe('GET /search', () => {
    const UNION = "' UNION SELECT name, hash, role FROM users --";
    const LOWER = "' union select name, hash, role from users where name like '";
    const DROP = "'; DROP TABLE orders --";
    const alicesHash = hashPassword('sunshine', 'sha256', '');

    it.each(['string', 'blocklist', 'parameters'] as const)('finds order 101 for lamp under %s', (queries) => {
      const { world } = setup({ ...string, queries });
      const answer = search(world, 'lamp');
      expect(answer.status).toBe(200);
      expect(answer.rows).toEqual([{ item: 'Lamp', total: 40, owner: 'alice' }]);
    });

    it('returns user rows for a UNION under string', () => {
      const answer = search(setup(string).world, UNION);
      expect(answer.rows!.map((row) => row.total)).toContain(alicesHash);
      expect(answer.body).toContain(alicesHash);
    });

    it('refuses the upper-case UNION under blocklist', () => {
      const answer = search(setup(blocklist).world, UNION);
      expect(answer.status).toBe(400);
      expect(answer.rows).toBeUndefined();
    });

    it('misses the lower-case one under blocklist', () => {
      expect(search(setup(blocklist).world, LOWER).rows!.map((row) => row.total)).toContain(alicesHash);
    });

    it('drops the table for a stacked statement under string', () => {
      const { world, db } = setup(string);
      expect(search(world, DROP).status).toBe(200);
      expect(db.execute('SELECT * FROM orders').ok).toBe(false);
    });

    it.each([UNION, LOWER, DROP, "'", "' UNION SELECT 1 --"])('keeps %s as plain text under parameters', (q) => {
      const { world, db } = setup(parameters);
      const answer = search(world, q);
      expect(answer.status).toBe(200);
      expect(answer.rows).toEqual([]);
      expect(db.rows('orders')).toHaveLength(3);
      expect(db.rows('users')).toHaveLength(4);
    });

    it.each(["'", "' UNION SELECT 1 --"])('gives a 500 with the interpreter message for %s', (q) => {
      const answer = search(setup(string).world, q);
      expect(answer.status).toBe(500);
      expect(answer.body).toContain('SQL error');
    });

    it('records the final query', () => {
      const { site, world } = setup(string);
      search(world, 'lamp');
      expect(site.trace!.at(-1)).toBe("SELECT item, total, owner FROM orders WHERE item LIKE '%lamp%'");
    });
  });

  describe('GET /ping', () => {
    const noShell = { commands: 'noShell' } as const;

    it('runs a second command under shell', () => {
      const { site, world } = setup({ commands: 'shell' });
      expect(ping(world, '8.8.8.8; cat /app/.env').body).toContain('DB_PASSWORD=fake-password');
      expect(site.trace).toEqual(['ping -c 1 8.8.8.8', 'cat /app/.env']);
    });

    it('refuses ; under blocklist and misses |', () => {
      const { world } = setup({ commands: 'blocklist' });
      expect(ping(world, '8.8.8.8; cat /app/.env').status).toBe(400);
      expect(ping(world, '8.8.8.8 && cat /app/.env').status).toBe(400);
      expect(ping(world, '8.8.8.8 | cat /app/.env').body).toContain('DB_PASSWORD=fake-password');
    });

    it.each(['8.8.8.8; cat /app/.env', '8.8.8.8 | cat /app/.env', '8.8.8.8 $(whoami)', '-c', ''])('gives 400 for %j under noShell', (host) => {
      expect(ping(setup(noShell).world, host).status).toBe(400);
    });

    it.each(['shell', 'blocklist', 'noShell'] as const)('pings 8.8.8.8 under %s', (commands) => {
      const answer = ping(setup({ commands }).world, '8.8.8.8');
      expect(answer.status).toBe(200);
      expect(answer.body).toContain('8.8.8.8');
    });
  });

  describe('GET /download', () => {
    const PASSWD = 'root:x:0:0';

    it.each(['../../etc/passwd', '%2e%2e%2f%2e%2e%2fetc/passwd'])('leaves the folder for %s under shell', (file) => {
      const { site, world } = setup({ commands: 'shell' });
      expect(download(world, file).body).toContain(PASSWD);
      expect(site.trace!.at(-1)).toBe('/etc/passwd');
    });

    it('stays in the folder for the plain form under blocklist', () => {
      expect(download(setup({ commands: 'blocklist' }).world, '../../etc/passwd').status).toBe(404);
    });

    it.each(['....//....//etc/passwd', '%2e%2e%2f%2e%2e%2fetc/passwd'])('leaves the folder for %s under blocklist', (file) => {
      expect(download(setup({ commands: 'blocklist' }).world, file).body).toContain(PASSWD);
    });

    it.each(['../../etc/passwd', '%2e%2e%2f%2e%2e%2fetc/passwd', '....//....//etc/passwd', '/etc/passwd', '../files/../../app/.env'])('refuses %s under noShell', (file) => {
      expect(download(setup({ commands: 'noShell' }).world, file).status).toBeGreaterThanOrEqual(400);
    });

    it.each(['shell', 'blocklist', 'noShell'] as const)('serves invoice.txt under %s', (commands) => {
      const answer = download(setup({ commands }).world, 'invoice.txt');
      expect(answer.status).toBe(200);
      expect(answer.body).toContain('Invoice');
    });

    it('does not throw on a bad escape', () => {
      expect(download(setup({ commands: 'shell' }).world, '%zz').status).toBe(404);
    });
  });
});

describe('blockedInput', () => {
  it.each([
    ['a OR b', true],
    ['a UNION b', true],
    ['a -- b', true],
    ['a or b', false],
    ['a union b', false],
    ['lamp', false],
  ])('%s', (text, blocked) => {
    expect(blockedInput(text)).toBe(blocked);
  });
});
