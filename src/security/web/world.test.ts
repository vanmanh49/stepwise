import { describe, expect, it } from 'vitest';
import { response, cookiesOf, type WebRequest } from './http';
import type { Site } from './site';
import { createWorld } from './world';

function sites(): Site[] {
  return [
    {
      origin: 'https://shop.example',
      party: 'shop',
      routes: [
        { method: 'POST', path: '/signin', handler: () => response(200, 'in', { setCookies: [{ name: 'sid', value: 's1' }] }) },
        { method: 'GET', path: /^\/orders\/\d+$/, handler: () => response(200, 'order') },
        { method: 'GET', path: '/echo', handler: (request) => response(200, JSON.stringify(cookiesOf(request))) },
        { method: 'GET', path: '/calls-login', handler: (_, world) => world.send(get('https://login.example/x'), 'shop') },
      ],
    },
    { origin: 'https://login.example', party: 'login', routes: [{ method: 'GET', path: '/x', handler: () => response(200, 'x') }] },
    { origin: 'https://evil.example', party: 'evil', routes: [{ method: 'GET', path: '/cb', handler: () => response(200, 'got it') }] },
  ];
}

const get = (url: string, headers: Record<string, string> = {}): WebRequest => ({ method: 'GET', url, headers, body: {} });

describe('delivery', () => {
  it('routes by host, method and path', () => {
    const world = createWorld(sites());
    expect(world.send(get('https://shop.example/orders/12'), 'attacker').body).toBe('order');
    expect(world.send(get('https://shop.example/nowhere'), 'attacker').status).toBe(404);
  });

  it('records a network error for an unknown host', () => {
    const world = createWorld(sites());
    expect(world.send(get('https://nowhere.example/'), 'browser').status).toBe(0);
    expect(world.events).toHaveLength(1);
    expect(world.events[0]!.response.status).toBe(0);
    expect(world.events[0]!.to).toBeNull();
  });

  it('sends subdomains of evil.example to the evil site', () => {
    const world = createWorld(sites());
    expect(world.send(get('https://shop.example.evil.example/cb'), 'browser').body).toBe('got it');
    expect(world.events[0]!.to).toBe('evil');
  });

  it('adds no browser cookies to a request from the attacker', () => {
    const world = createWorld(sites());
    world.browser.submit('https://shop.example/signin', {});
    expect(world.browser.jar()).toHaveLength(1);
    expect(world.send(get('https://shop.example/echo'), 'attacker').body).toBe('{}');
    expect(world.browser.visit('https://shop.example/echo').body).toBe('{"sid":"s1"}');
  });

  it('records an outer request before the one it caused', () => {
    const world = createWorld(sites());
    world.browser.visit('https://shop.example/calls-login');
    expect(world.events.map((e) => [e.from, e.to])).toEqual([
      ['browser', 'shop'],
      ['shop', 'login'],
    ]);
    expect(world.events[0]!.response.body).toBe('x');
  });
});

describe('the eavesdropper', () => {
  it('reads http in full', () => {
    const world = createWorld(sites());
    world.send({ method: 'POST', url: 'http://shop.example/signin', headers: { cookie: 'sid=s1' }, body: { name: 'alice' } }, 'browser');
    expect(world.sniffed()).toEqual([{ host: 'shop.example', url: 'http://shop.example/signin', cookies: { sid: 's1' }, body: { name: 'alice' } }]);
  });

  it('sees only the host of https', () => {
    const world = createWorld(sites());
    world.send({ method: 'POST', url: 'https://shop.example/signin', headers: { cookie: 'sid=s1' }, body: { name: 'alice' } }, 'browser');
    expect(world.sniffed()).toEqual([{ host: 'shop.example' }]);
  });
});

describe('the clock', () => {
  it('moves only when told', () => {
    const world = createWorld(sites());
    const start = world.now();
    world.advance(30);
    expect(world.now()).toBe(start + 30);
  });

  it('expires browser cookies', () => {
    const world = createWorld(sites());
    world.browser.plant('https://shop.example/', { name: 'a', value: '1', maxAge: 10 });
    world.advance(10);
    expect(world.browser.jar()).toEqual([]);
  });
});

describe('repeat runs', () => {
  const play = () => {
    const world = createWorld(sites());
    world.browser.submit('https://shop.example/signin', {});
    world.browser.visit('https://shop.example/orders/1');
    return { events: world.events, random: world.random() };
  };

  it('are deep-equal', () => {
    expect(play()).toEqual(play());
  });
});

describe('connecting', () => {
  const internal: Site = { origin: 'http://metadata.internal', party: 'internal', routes: [{ method: 'GET', path: '/', handler: () => response(200, 'secret') }] };

  it.each(['http://METADATA.INTERNAL/', 'http://metadata.internal:80/', 'http://user@metadata.internal/', 'HTTP://metadata.internal/'])('reaches the host %s names', (url) => {
    expect(createWorld([internal]).send(get(url), 'shop').status).toBe(200);
  });

  it('does not treat another port as the same site', () => {
    expect(createWorld([internal]).send(get('http://metadata.internal:8080/'), 'shop').status).toBe(0);
  });
});

describe('site names', () => {
  const internal: Site = { origin: 'http://metadata.internal', party: 'internal', hosts: ['169.254.169.254'], routes: [{ method: 'GET', path: '/', handler: () => response(200, 'secret') }] };

  it('answers a request from the shop on any of its hosts', () => {
    const world = createWorld([internal]);
    expect(world.send(get('http://metadata.internal/'), 'shop').status).toBe(200);
    expect(world.send(get('http://169.254.169.254/'), 'shop').status).toBe(200);
  });

  it.each(['browser', 'attacker', 'evil'] as const)('gives %s a network error', (from) => {
    const world = createWorld([internal]);
    expect(world.send(get('http://metadata.internal/'), from).status).toBe(0);
    expect(world.events[0]!.to).toBeNull();
  });
});
