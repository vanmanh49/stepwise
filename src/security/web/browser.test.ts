import { describe, expect, it } from 'vitest';
import { keyPair, verify } from '../crypto/rsa';
import { createBrowser, type Network } from './browser';
import { cookiesOf, response, type SetCookie, type WebRequest, type WebResponse } from './http';

const SHOP = 'https://shop.example/account';
const EVIL = 'https://evil.example';

function setup(answer: (request: WebRequest) => WebResponse = () => response(200)) {
  const sent: WebRequest[] = [];
  let time = 1000;
  const network: Network = {
    send: (request) => {
      sent.push(request);
      return answer(request);
    },
    now: () => time,
  };
  return { browser: createBrowser(network), sent, advance: (seconds: number) => (time += seconds) };
}

const cookie = (extra: Partial<SetCookie>): SetCookie => ({ name: 'sid', value: 'v', ...extra });

describe('which cookies go with a request', () => {
  it.each<[string, Partial<SetCookie>, string, string | undefined, 'GET' | 'POST', boolean]>([
    ['Secure over http', { secure: true }, 'http://shop.example/', undefined, 'GET', false],
    ['Secure over https', { secure: true }, SHOP, undefined, 'GET', true],
    ['host-only on a subdomain', {}, 'https://api.shop.example/', undefined, 'GET', false],
    ['domain on a subdomain', { domain: 'shop.example' }, 'https://api.shop.example/', undefined, 'GET', true],
    ['domain on a lookalike host', { domain: 'shop.example' }, 'https://notshop.example/', undefined, 'GET', false],
    ['Strict on a same-site request', { sameSite: 'Strict' }, SHOP, SHOP, 'GET', true],
    ['Strict on a cross-site GET', { sameSite: 'Strict' }, SHOP, EVIL, 'GET', false],
    ['Lax on a cross-site GET', { sameSite: 'Lax' }, SHOP, EVIL, 'GET', true],
    ['Lax on a cross-site POST', { sameSite: 'Lax' }, SHOP, EVIL, 'POST', false],
    ['None with Secure on a cross-site POST', { sameSite: 'None', secure: true }, SHOP, EVIL, 'POST', true],
    ['no SameSite on a cross-site GET', {}, SHOP, EVIL, 'GET', true],
    ['no SameSite on a cross-site POST', {}, SHOP, EVIL, 'POST', false],
    ['Strict with no initiator', { sameSite: 'Strict' }, SHOP, undefined, 'POST', true],
    ['a path that does not match', { path: '/admin' }, SHOP, undefined, 'GET', false],
    ['a path that matches', { path: '/account' }, SHOP, undefined, 'GET', true],
  ])('%s', (_name, extra, url, initiator, method, sent) => {
    const { browser } = setup();
    browser.plant('https://shop.example/', cookie(extra));
    expect('sid' in browser.cookiesFor(url, initiator, method)).toBe(sent);
  });

  it('sends them in a cookie header on a visit', () => {
    const { browser, sent } = setup();
    browser.plant(SHOP, cookie({}));
    browser.visit(SHOP);
    expect(cookiesOf(sent[0]!)).toEqual({ sid: 'v' });
  });

  it('applies the initiator to a form post', () => {
    const { browser, sent } = setup();
    browser.plant(SHOP, cookie({}));
    browser.submit(SHOP, { a: '1' }, EVIL);
    expect(cookiesOf(sent[0]!)).toEqual({});
    expect(sent[0]!.body).toEqual({ a: '1' });
  });
});

describe('storing cookies', () => {
  it('rejects SameSite=None without Secure', () => {
    const { browser } = setup();
    browser.plant(SHOP, cookie({ sameSite: 'None' }));
    expect(browser.jar()).toEqual([]);
  });

  it('rejects a domain the setting host does not belong to', () => {
    const { browser } = setup();
    browser.plant(EVIL, cookie({ domain: 'shop.example' }));
    expect(browser.jar()).toEqual([]);
  });

  it('expires a cookie at exactly maxAge seconds', () => {
    const { browser, advance } = setup();
    browser.plant(SHOP, cookie({ maxAge: 60 }));
    advance(59);
    expect(browser.jar()).toHaveLength(1);
    advance(1);
    expect(browser.jar()).toEqual([]);
  });

  it('deletes a cookie with maxAge 0', () => {
    const { browser } = setup();
    browser.plant(SHOP, cookie({}));
    browser.plant(SHOP, cookie({ maxAge: 0 }));
    expect(browser.jar()).toEqual([]);
  });

  it('replaces a cookie with the same name and host', () => {
    const { browser } = setup();
    browser.plant(SHOP, cookie({ value: 'old' }));
    browser.plant(SHOP, cookie({ value: 'new' }));
    expect(browser.jar().map((c) => c.value)).toEqual(['new']);
  });

  it('keeps same-named cookies from different hosts apart', () => {
    const { browser } = setup();
    browser.plant(SHOP, cookie({ value: 'shop' }));
    browser.plant(EVIL, cookie({ value: 'evil' }));
    expect(browser.jar()).toHaveLength(2);
  });
});

describe('redirects', () => {
  it('stores cookies from every hop', () => {
    const { browser } = setup((request) =>
      request.url === SHOP ? response(302, '', { redirect: 'https://shop.example/two', setCookies: [cookie({ name: 'a' })] }) : response(200, 'done', { setCookies: [cookie({ name: 'b' })] }),
    );
    expect(browser.visit(SHOP).body).toBe('done');
    expect(browser.jar().map((c) => c.name)).toEqual(['a', 'b']);
  });

  it('stops after 5 redirects with the last response', () => {
    const { browser, sent } = setup(() => response(302, 'again', { redirect: SHOP }));
    expect(browser.visit(SHOP).status).toBe(302);
    expect(sent).toHaveLength(6);
  });

  it('can stop before a redirect, leaving it for later', () => {
    const { browser, sent } = setup(() => response(302, '', { redirect: 'https://shop.example/callback?code=1' }));
    expect(browser.visit(SHOP, undefined, 'https://shop.example/callback').redirect).toBe('https://shop.example/callback?code=1');
    expect(sent).toHaveLength(1);
  });

  it('turns a form post into a GET when it redirects', () => {
    const { browser, sent } = setup((request) => (request.method === 'POST' ? response(302, '', { redirect: SHOP }) : response(200)));
    browser.submit(SHOP, {});
    expect(sent.map((r) => r.method)).toEqual(['POST', 'GET']);
  });
});

describe('page scripts', () => {
  it('see cookies but not HttpOnly ones', () => {
    const { browser } = setup();
    browser.plant(SHOP, cookie({ name: 'open' }));
    browser.plant(SHOP, cookie({ name: 'hidden', httpOnly: true }));
    expect(browser.runScript('https://shop.example')).toEqual({ open: 'v' });
  });

  it("do not see another host's cookies", () => {
    const { browser } = setup();
    browser.plant(SHOP, cookie({}));
    expect(browser.runScript(EVIL)).toEqual({});
  });
});

describe('passkeys', () => {
  const key = keyPair(691, 809, 17)!;

  it('sign for the registered origin, naming that origin', () => {
    const { browser } = setup();
    browser.registerPasskey('https://shop.example', key);
    const signature = browser.passkeySign('https://shop.example', 'c1');
    expect(signature).not.toBeNull();
    expect(verify('https://shop.example c1', signature!, key)).toBe(true);
  });

  it('refuse any other origin', () => {
    const { browser } = setup();
    browser.registerPasskey('https://shop.example', key);
    expect(browser.passkeySign('https://evil.example', 'c1')).toBeNull();
  });
});

describe('subresource requests', () => {
  it.each<[string, Partial<SetCookie>, string, boolean]>([
    ['Lax across sites', { sameSite: 'Lax' }, EVIL, false],
    ['no SameSite across sites', {}, EVIL, false],
    ['None with Secure across sites', { sameSite: 'None', secure: true }, EVIL, true],
    ['Strict on the same site', { sameSite: 'Strict' }, SHOP, true],
  ])('%s', (_name, flags, initiator, sent) => {
    const { browser } = setup();
    browser.plant(SHOP, cookie(flags));
    expect('sid' in browser.cookiesFor(SHOP, initiator, 'GET', true)).toBe(sent);
  });

  it('sends a GET with no origin header', () => {
    const { browser, sent } = setup();
    browser.subresource(SHOP, EVIL);
    expect(sent[0]).toMatchObject({ method: 'GET', url: SHOP });
    expect(sent[0]!.headers.origin).toBeUndefined();
  });

  it('sends no Lax cookie across sites, and sends a None one', () => {
    const { browser, sent } = setup();
    browser.plant(SHOP, cookie({ sameSite: 'Lax' }));
    browser.subresource(SHOP, EVIL);
    browser.plant(SHOP, cookie({ sameSite: 'None', secure: true }));
    browser.subresource(SHOP, EVIL);
    expect(sent.map((request) => request.headers.cookie)).toEqual([undefined, 'sid=v']);
  });

  it('follows a redirect under the same rules', () => {
    const { browser, sent } = setup((request) => (request.url === SHOP ? response(302, '', { redirect: `${EVIL}/next` }) : response(200, 'done')));
    expect(browser.subresource(SHOP, EVIL).body).toBe('done');
    expect(sent.map((request) => request.url)).toEqual([SHOP, `${EVIL}/next`]);
  });
});

describe('cookie paths', () => {
  it.each([
    ['https://shop.example/admin', true],
    ['https://shop.example/admin/x', true],
    ['https://shop.example/administrator', false],
  ])('a path of /admin against %s', (url, sent) => {
    const { browser } = setup();
    browser.plant(url, cookie({ path: '/admin' }));
    expect('sid' in browser.cookiesFor(url)).toBe(sent);
  });

  it('treats a path ending in a slash as a prefix', () => {
    const { browser } = setup();
    browser.plant(SHOP, cookie({ path: '/admin/' }));
    expect('sid' in browser.cookiesFor('https://shop.example/admin/x')).toBe(true);
  });
});

describe('Secure cookies and http', () => {
  it('rejects a Secure cookie set from http', () => {
    const { browser } = setup();
    browser.plant('http://shop.example/', cookie({ secure: true }));
    expect(browser.jar()).toEqual([]);
  });

  it('will not let http replace a Secure cookie', () => {
    const { browser } = setup();
    browser.plant('https://shop.example/', cookie({ secure: true, value: 'real' }));
    browser.plant('http://shop.example/', cookie({ value: 'fake' }));
    expect(browser.jar().map((c) => c.value)).toEqual(['real']);
  });

  it('lets https replace a Secure cookie', () => {
    const { browser } = setup();
    browser.plant('https://shop.example/', cookie({ secure: true, value: 'old' }));
    browser.plant('https://shop.example/', cookie({ secure: true, value: 'new' }));
    expect(browser.jar().map((c) => c.value)).toEqual(['new']);
  });
});

describe('submit', () => {
  it('names the initiator in an origin header', () => {
    const { browser, sent } = setup();
    browser.submit(SHOP, {}, `${EVIL}/page`);
    expect(sent[0]!.headers.origin).toBe(EVIL);
  });

  it('names the page itself when nothing else started the request', () => {
    const { browser, sent } = setup();
    browser.submit(SHOP, {});
    expect(sent[0]!.headers.origin).toBe('https://shop.example');
  });
});
