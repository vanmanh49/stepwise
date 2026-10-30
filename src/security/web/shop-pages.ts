import { sql, type ShopDb } from './db';
import { escapeHtml } from './html';
import { cookiesOf, hostOf, queryOf, response, type WebRequest, type WebResponse } from './http';
import { IMAGES_HOST } from './internal';
import { HASH_SINK } from './page';
import type { ShopOptions } from './shop';
import { randomHex, type Handler, type Route } from './site';
import type { World } from './world';

type Context = {
  options: ShopOptions;
  db: ShopDb;
  origin: string;
  signedIn(page: (account: { name: string; role: string }, request: WebRequest, world: World) => WebResponse): Handler;
  /** Runs text built from learner input. A failure comes back as the page to show. */
  runBuilt(statement: string): { rows: Record<string, unknown>[] } | WebResponse;
};

/** A real blocklist that really fails: it knows the exact text, so lower case gets through. */
export const blockedInput = (text: string): boolean => ['OR', 'UNION', '--'].some((word) => text.includes(word));

export const REFUSED_INPUT = 'That input was refused.';

const MAX_REDIRECTS = 3;
const FIRST_NEW_ORDER = 104;
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '169.254.169.254'];
const EGRESS_HOST = 'backup.shop.example';

const fetchInside = (world: World, url: string, method: WebRequest['method'] = 'GET', body: Record<string, string> = {}) => world.send({ method, url, headers: {}, body }, 'shop');

/** The routes behind the web attack lessons: pages that show input, orders, previews and the export. */
export function pageRoutes({ options, db, origin, signedIn, runBuilt }: Context): Route[] {
  const csrfTokens = new Map<string, string>();
  let nextOrder = FIRST_NEW_ORDER;
  let nextComment = 1;

  const shown = (text: string) => (options.encode ? escapeHtml(text) : text);

  /** Every page goes through here, so each gets the policy and its own script. */
  function page(world: World, content: string, extra: Partial<WebResponse> = {}): WebResponse {
    const nonce = options.csp === 'nonce' ? randomHex(world, 8) : '';
    const policy = options.csp === 'nonce' ? `script-src 'nonce-${nonce}'` : options.csp === 'unsafeInline' ? "script-src 'self' 'unsafe-inline'" : undefined;
    const own = `<script${nonce && ` nonce="${nonce}"`}>console.log('page ready')</script>`;
    return response(200, `${content}\n${own}`, { ...extra, headers: { ...extra.headers, ...(policy && { 'content-security-policy': policy }) } });
  }

  const search: Handler = (request, world) => {
    const q = queryOf(request.url).q ?? '';
    if (options.queries === 'blocklist' && blockedInput(q)) return response(400, REFUSED_INPUT);
    const answer = runBuilt(options.queries === 'parameters' ? sql`SELECT item, total, owner FROM orders WHERE item LIKE ${`%${q}%`}` : `SELECT item, total, owner FROM orders WHERE item LIKE '%${q}%'`);
    if ('status' in answer) return answer;
    return page(world, [`Results for ${shown(q)}:`, ...answer.rows.map((row) => shown(Object.values(row).join(' | ')))].join('\n'), { rows: answer.rows });
  };

  const comments: Handler = (_, world) => page(world, db.rows('comments').map(({ author, body }) => `${shown(String(author))}: ${shown(String(body))}`).join('\n') || 'No comments yet.');

  const addComment = signedIn(({ name }, request) => {
    db.run(sql`INSERT INTO comments (id, author, body) VALUES (${nextComment++}, ${name}, ${request.body.body ?? ''})`);
    return response(200, 'Comment saved.');
  });

  const welcome: Handler = (_, world) => page(world, 'Welcome!', { headers: { [HASH_SINK]: options.encode ? 'textContent' : 'innerHTML' } });

  const orderForm = signedIn((_, request, world) => {
    const session = cookiesOf(request).sid ?? '';
    const token = csrfTokens.get(session) ?? randomHex(world, 16);
    csrfTokens.set(session, token);
    return page(world, `<form method="post" action="/orders"><input type="hidden" name="token" value="${token}"><input name="item"></form>`);
  });

  /** What stops a forged order, or null if this one may go ahead. */
  function forged(request: WebRequest, token: string | undefined): WebResponse | null {
    if (options.csrf === 'token' && (!token || token !== csrfTokens.get(cookiesOf(request).sid ?? ''))) return response(403, 'That request has no valid CSRF token.');
    const { origin: from } = request.headers;
    if (options.csrf === 'origin' && from !== undefined && from !== origin) return response(403, `Orders do not come from ${from}.`);
    return null;
  }

  const placeOrder = (name: string, request: WebRequest, item = '', token?: string) => {
    const refused = forged(request, token);
    if (refused) return refused;
    db.run(sql`INSERT INTO orders (id, owner, item, total) VALUES (${nextOrder++}, ${name}, ${item}, ${0})`);
    return response(200, `Order placed: ${item}.`);
  };

  const postOrder = signedIn(({ name }, request) => placeOrder(name, request, request.body.item, request.body.token));

  /** Changes state on a GET on purpose: the flaw the image attack needs. */
  const getOrder = signedIn(({ name }, request) => {
    const { item, token } = queryOf(request.url);
    return placeOrder(name, request, item, token);
  });

  const preview: Handler = (request, world) => {
    const { url = '' } = queryOf(request.url);
    const host = hostOf(url);
    if (options.preview === 'blocklist' && BLOCKED_HOSTS.includes(host)) return response(403, `${host} is on the blocklist.`);
    if (options.preview === 'allowList' && host !== IMAGES_HOST) return response(403, `${host || 'That address'} is not on the allow-list.`);
    let answer = fetchInside(world, url);
    for (let hop = 0; options.preview !== 'allowList' && answer.redirect !== undefined && hop < MAX_REDIRECTS; hop++) answer = fetchInside(world, answer.redirect);
    if (answer.status === 0 || answer.redirect !== undefined) return response(502, `Could not preview ${url}.`);
    return response(answer.status, answer.body);
  };

  const exportUsers = signedIn(({ role }, request, world) => {
    if (options.access.roleCheck && role !== 'admin') return response(403, 'Admins only.');
    const { to = '' } = queryOf(request.url);
    if (options.egress && hostOf(to) !== EGRESS_HOST) return response(403, `Outbound traffic to ${hostOf(to) || 'that address'} is blocked.`);
    const users = db.rows('users').map(({ name, hash }) => `${name}:${hash}`).join('\n');
    const answer = fetchInside(world, to, 'POST', { users });
    return answer.status === 0 ? response(502, `Could not reach ${to}.`) : response(200, `Exported the users table to ${to}.`);
  });

  return [
    { method: 'GET', path: '/search', handler: search },
    { method: 'GET', path: '/comments', handler: comments },
    { method: 'POST', path: '/comments', handler: addComment },
    { method: 'GET', path: '/welcome', handler: welcome },
    { method: 'GET', path: '/order-form', handler: orderForm },
    { method: 'POST', path: '/orders', handler: postOrder },
    { method: 'GET', path: '/orders/new', handler: getOrder },
    { method: 'GET', path: '/preview', handler: preview },
    { method: 'POST', path: '/admin/export', handler: exportUsers },
  ];
}
