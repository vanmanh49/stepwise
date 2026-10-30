import { seeded } from '../../utils/random';
import { createBrowser, type Browser, type Network, type Party } from './browser';
import { START_TIME } from './data';
import { cookiesOf, hostOf, response, type WebRequest, type WebResponse } from './http';
import { handle, type Site } from './site';

/** `to` is null when the host doesn't exist. */
export type WebEvent = { from: Party; to: Party | null; request: WebRequest; response: WebResponse; at: number };

export type Sniffed = { host: string; url?: string; cookies?: Record<string, string>; body?: Record<string, string> };

export type World = {
  browser: Browser;
  now(): number;
  advance(seconds: number): void;
  send: Network['send'];
  sites: Site[];
  events: WebEvent[];
  sniffed(): Sniffed[];
  site(party: Party): Site;
  random(): number;
};

export function createWorld(sites: Site[], seed = 1): World {
  let time = START_TIME;
  const events: WebEvent[] = [];
  const random = seeded(seed);

  const siteFor = (host: string) => sites.find((site) => hostOf(site.origin) === host) ?? (host.endsWith('.evil.example') ? sites.find((site) => site.party === 'evil') : undefined);

  const send: Network['send'] = (request, from) => {
    const site = siteFor(hostOf(request.url));
    // In the list before the handler runs, so a request appears ahead of any it causes.
    const event: WebEvent = { from, to: site?.party ?? null, request, response: response(0, 'Network error: no such host'), at: time };
    events.push(event);
    if (site) event.response = handle(site, request, world);
    return event.response;
  };

  const world: World = {
    browser: createBrowser({ send, now: () => time }),
    now: () => time,
    advance: (seconds) => {
      time += seconds;
    },
    send,
    sites,
    events,
    sniffed: () =>
      events.map(({ request }) => {
        const host = hostOf(request.url);
        return request.url.startsWith('http:') ? { host, url: request.url, cookies: cookiesOf(request), body: request.body } : { host };
      }),
    site: (party) => sites.find((site) => site.party === party)!,
    random,
  };
  return world;
}
