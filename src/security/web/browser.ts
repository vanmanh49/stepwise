import { sign, type RsaKey } from '../crypto/rsa';
import { cookieHeader, hostOf, originOf, pathOf, siteOf, type SetCookie, type WebRequest, type WebResponse } from './http';

export type Party = 'browser' | 'attacker' | 'evil' | 'shop' | 'login';

export type StoredCookie = SetCookie & { host: string; expires?: number };

export type Network = { send(request: WebRequest, from: Party): WebResponse; now(): number };

export type Browser = {
  jar(): StoredCookie[];
  /** Follows redirects, stopping before one that starts with `stopBefore`. */
  visit(url: string, initiator?: string, stopBefore?: string): WebResponse;
  submit(url: string, body: Record<string, string>, initiator?: string): WebResponse;
  runScript(origin: string): Record<string, string>;
  /** `subresource` is for what a page loads for itself, such as an image, rather than a navigation. */
  cookiesFor(url: string, initiator?: string, method?: WebRequest['method'], subresource?: boolean): Record<string, string>;
  /** An `<img>` request: a GET with no `origin` header. */
  subresource(url: string, initiator: string): WebResponse;
  plant(url: string, cookie: SetCookie): void;
  passkeySign(origin: string, challenge: string): number | null;
  registerPasskey(origin: string, key: RsaKey): void;
};

const MAX_REDIRECTS = 5;

const belongsTo = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** On a segment boundary, so `/admin` does not match `/administrator`. */
const underPath = (path: string, prefix: string) => path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);

export function createBrowser(network: Network): Browser {
  let cookies: StoredCookie[] = [];
  let passkey: { origin: string; key: RsaKey } | null = null;

  const jar = () => {
    cookies = cookies.filter((cookie) => cookie.expires === undefined || network.now() < cookie.expires);
    return cookies;
  };

  const store = (url: string, cookie: SetCookie) => {
    const host = hostOf(url);
    const overHttp = !url.startsWith('https:');
    if (cookie.sameSite === 'None' && !cookie.secure) return;
    if (overHttp && (cookie.secure || cookies.some((old) => old.secure && old.name === cookie.name && old.host === host))) return;
    if (cookie.domain && !belongsTo(host, cookie.domain)) return;
    cookies = cookies.filter((old) => old.name !== cookie.name || old.host !== host);
    if (cookie.maxAge === 0) return;
    cookies.push({ ...cookie, host, ...(cookie.maxAge !== undefined && { expires: network.now() + cookie.maxAge }) });
  };

  const onRoute = (cookie: StoredCookie, url: string) => {
    const host = hostOf(url);
    const hostMatches = cookie.domain ? belongsTo(host, cookie.domain) : host === cookie.host;
    return hostMatches && underPath(pathOf(url), cookie.path ?? '/') && (!cookie.secure || url.startsWith('https:'));
  };

  const crossSiteAllows = (cookie: StoredCookie, method: WebRequest['method'], subresource: boolean) => {
    if (cookie.sameSite === 'None') return true;
    return !subresource && cookie.sameSite !== 'Strict' && method === 'GET';
  };

  const cookiesFor: Browser['cookiesFor'] = (url, initiator, method = 'GET', subresource = false) => {
    const crossSite = initiator !== undefined && siteOf(hostOf(initiator)) !== siteOf(hostOf(url));
    const sent = jar().filter((cookie) => onRoute(cookie, url) && (!crossSite || crossSiteAllows(cookie, method, subresource)));
    return Object.fromEntries(sent.map((cookie) => [cookie.name, cookie.value]));
  };

  type SendOptions = { headers?: Record<string, string>; subresource?: boolean };

  const send = (method: WebRequest['method'], url: string, body: Record<string, string>, initiator?: string, { headers = {}, subresource }: SendOptions = {}) => {
    const header = cookieHeader(cookiesFor(url, initiator, method, subresource));
    const answer = network.send({ method, url, headers: { ...headers, ...(header && { cookie: header }) }, body }, 'browser');
    for (const cookie of answer.setCookies) store(url, cookie);
    return answer;
  };

  const follow = (url: string, initiator: string | undefined, stopBefore?: string, subresource?: boolean) => {
    let answer = send('GET', url, {}, initiator, { subresource });
    for (let hop = 0; answer.redirect !== undefined && hop < MAX_REDIRECTS; hop++) {
      if (stopBefore && answer.redirect.startsWith(stopBefore)) break;
      answer = send('GET', answer.redirect, {}, initiator, { subresource });
    }
    return answer;
  };

  const visit: Browser['visit'] = (url, initiator, stopBefore) => follow(url, initiator, stopBefore);

  return {
    jar: () => jar().map((cookie) => ({ ...cookie })),
    visit,
    submit: (url, body, initiator) => {
      const answer = send('POST', url, body, initiator, { headers: { origin: originOf(initiator ?? url) } });
      return answer.redirect === undefined ? answer : visit(answer.redirect, initiator);
    },
    subresource: (url, initiator) => follow(url, initiator, undefined, true),
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
