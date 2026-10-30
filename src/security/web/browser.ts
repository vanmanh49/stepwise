import { sign, type RsaKey } from '../crypto/rsa';
import { cookieHeader, hostOf, originOf, pathOf, siteOf, type SetCookie, type WebRequest, type WebResponse } from './http';

export type Party = 'browser' | 'attacker' | 'evil' | 'shop' | 'login';

export type StoredCookie = SetCookie & { host: string; expires?: number };

export type Network = { send(request: WebRequest, from: Party): WebResponse; now(): number };

export type FetchResult = { sent: boolean; status: number; readable: boolean; body: string | null; blockedBy?: string };

export type FetchOptions = { method?: 'GET' | 'PUT'; credentials?: boolean; headers?: Record<string, string> };

export type Browser = {
  jar(): StoredCookie[];
  /** Follows redirects, stopping before one that starts with `stopBefore`. */
  visit(url: string, initiator?: string, stopBefore?: string): WebResponse;
  submit(url: string, body: Record<string, string>, initiator?: string): WebResponse;
  /** A page's `fetch`, which follows the same-origin policy and CORS. */
  fetchFrom(origin: string, url: string, options?: FetchOptions): FetchResult;
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

/** Why a page may not read this response, or undefined if it may. */
function corsRefusal(answer: WebResponse, origin: string, credentials: boolean): string | undefined {
  const allowed = answer.headers['access-control-allow-origin'];
  if (allowed === undefined) return 'the response has no access-control-allow-origin header';
  if (allowed === '*') return credentials ? 'access-control-allow-origin: * is refused for a request with credentials' : undefined;
  if (allowed !== origin) return `access-control-allow-origin names ${allowed}, not ${origin}`;
  if (credentials && answer.headers['access-control-allow-credentials'] !== 'true') return 'access-control-allow-credentials is missing';
  return undefined;
}

const listed = (header: string | undefined, name: string) => (header ?? '').toLowerCase().split(/,\s*/).includes(name.toLowerCase());

function preflightRefusal(answer: WebResponse, origin: string, credentials: boolean, method: string, headers: string[]): string | undefined {
  const refusal = corsRefusal(answer, origin, credentials);
  if (refusal) return refusal;
  if (!listed(answer.headers['access-control-allow-methods'], method)) return `the preflight does not allow ${method}`;
  const missing = headers.find((name) => !listed(answer.headers['access-control-allow-headers'], name));
  return missing && `the preflight does not allow the header ${missing}`;
}

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

  type SendOptions = { headers?: Record<string, string>; subresource?: boolean; credentials?: boolean };

  const send = (method: WebRequest['method'], url: string, body: Record<string, string>, initiator?: string, { headers = {}, subresource, credentials = true }: SendOptions = {}) => {
    const header = credentials ? cookieHeader(cookiesFor(url, initiator, method, subresource)) : '';
    const answer = network.send({ method, url, headers: { ...headers, ...(header && { cookie: header }) }, body }, 'browser');
    if (credentials) for (const cookie of answer.setCookies) store(url, cookie);
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

  // shortcut: fetch does not follow redirects, so a payload sees the 3xx; follow them if a lesson needs it.
  const fetchFrom: Browser['fetchFrom'] = (origin, url, { method = 'GET', credentials = false, headers = {} } = {}) => {
    const sameOrigin = originOf(url) === origin;
    const custom = Object.keys(headers);
    if (!sameOrigin && (method !== 'GET' || custom.length > 0)) {
      const preflight = send('OPTIONS', url, {}, origin, { credentials: false, headers: { origin, 'access-control-request-method': method } });
      const blockedBy = preflightRefusal(preflight, origin, credentials, method, custom);
      if (blockedBy) return { sent: false, status: preflight.status, readable: false, body: null, blockedBy };
    }
    const answer = send(method, url, {}, origin, { credentials, subresource: true, headers: { ...headers, ...((!sameOrigin || method !== 'GET') && { origin }) } });
    const blockedBy = answer.status === 0 ? 'no such host' : sameOrigin ? undefined : corsRefusal(answer, origin, credentials);
    return blockedBy ? { sent: true, status: answer.status, readable: false, body: null, blockedBy } : { sent: true, status: answer.status, readable: true, body: answer.body };
  };

  return {
    jar: () => jar().map((cookie) => ({ ...cookie })),
    visit,
    submit: (url, body, initiator) => {
      const answer = send('POST', url, body, initiator, { headers: { origin: originOf(initiator ?? url) } });
      return answer.redirect === undefined ? answer : visit(answer.redirect, initiator);
    },
    subresource: (url, initiator) => follow(url, initiator, undefined, true),
    fetchFrom,
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
