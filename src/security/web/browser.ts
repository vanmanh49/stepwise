import { sign, type RsaKey } from '../crypto/rsa';
import { cookieHeader, hostOf, pathOf, siteOf, type SetCookie, type WebRequest, type WebResponse } from './http';

export type Party = 'browser' | 'attacker' | 'evil' | 'shop' | 'login';

export type StoredCookie = SetCookie & { host: string; expires?: number };

export type Network = { send(request: WebRequest, from: Party): WebResponse; now(): number };

export type Browser = {
  jar(): StoredCookie[];
  visit(url: string, initiator?: string): WebResponse;
  submit(url: string, body: Record<string, string>, initiator?: string): WebResponse;
  runScript(origin: string): Record<string, string>;
  cookiesFor(url: string, initiator?: string, method?: WebRequest['method']): Record<string, string>;
  plant(url: string, cookie: SetCookie): void;
  passkeySign(origin: string, challenge: string): number | null;
  registerPasskey(origin: string, key: RsaKey): void;
};

const MAX_REDIRECTS = 5;

const belongsTo = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function createBrowser(network: Network): Browser {
  let cookies: StoredCookie[] = [];
  let passkey: { origin: string; key: RsaKey } | null = null;

  const jar = () => {
    cookies = cookies.filter((cookie) => cookie.expires === undefined || network.now() < cookie.expires);
    return cookies;
  };

  const store = (url: string, cookie: SetCookie) => {
    const host = hostOf(url);
    if (cookie.sameSite === 'None' && !cookie.secure) return;
    if (cookie.domain && !belongsTo(host, cookie.domain)) return;
    cookies = cookies.filter((old) => old.name !== cookie.name || old.host !== host);
    if (cookie.maxAge === 0) return;
    cookies.push({ ...cookie, host, ...(cookie.maxAge !== undefined && { expires: network.now() + cookie.maxAge }) });
  };

  const onRoute = (cookie: StoredCookie, url: string) => {
    const host = hostOf(url);
    const hostMatches = cookie.domain ? belongsTo(host, cookie.domain) : host === cookie.host;
    return hostMatches && pathOf(url).startsWith(cookie.path ?? '/') && (!cookie.secure || url.startsWith('https:'));
  };

  const crossSiteAllows = (cookie: StoredCookie, method: WebRequest['method']) => {
    if (cookie.sameSite === 'Strict') return false;
    return cookie.sameSite === 'None' || method === 'GET';
  };

  const cookiesFor: Browser['cookiesFor'] = (url, initiator, method = 'GET') => {
    const crossSite = initiator !== undefined && siteOf(hostOf(initiator)) !== siteOf(hostOf(url));
    const sent = jar().filter((cookie) => onRoute(cookie, url) && (!crossSite || crossSiteAllows(cookie, method)));
    return Object.fromEntries(sent.map((cookie) => [cookie.name, cookie.value]));
  };

  const send = (method: WebRequest['method'], url: string, body: Record<string, string>, initiator?: string) => {
    const header = cookieHeader(cookiesFor(url, initiator, method));
    const answer = network.send({ method, url, headers: header ? { cookie: header } : {}, body }, 'browser');
    for (const cookie of answer.setCookies) store(url, cookie);
    return answer;
  };

  const visit: Browser['visit'] = (url, initiator) => {
    let answer = send('GET', url, {}, initiator);
    for (let hop = 0; answer.redirect !== undefined && hop < MAX_REDIRECTS; hop++) answer = send('GET', answer.redirect, {}, initiator);
    return answer;
  };

  return {
    jar: () => jar().map((cookie) => ({ ...cookie })),
    visit,
    submit: (url, body, initiator) => {
      const answer = send('POST', url, body, initiator);
      return answer.redirect === undefined ? answer : visit(answer.redirect, initiator);
    },
    runScript: (origin) => {
      const url = `${origin}/`;
      return Object.fromEntries(
        jar()
          .filter((cookie) => onRoute(cookie, url) && !cookie.httpOnly)
          .map((cookie) => [cookie.name, cookie.value]),
      );
    },
    cookiesFor,
    plant: store,
    passkeySign: (origin, challenge) => (passkey?.origin === origin ? sign(`${origin} ${challenge}`, passkey.key) : null),
    registerPasskey: (origin, key) => {
      passkey = { origin, key };
    },
  };
}
