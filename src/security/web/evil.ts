import { pathOf, queryOf, response, type WebRequest } from './http';
import { SHOP_ORIGIN } from './shop';
import type { Handler, Site } from './site';
import type { World } from './world';

export const EVIL_ORIGIN = 'https://evil.example';

/** Codes that reached the attacker's site, read from its traffic. */
export const evilInbox = (world: World): string[] => world.events.filter((event) => event.to === 'evil' && pathOf(event.request.url) === '/cb').map((event) => queryOf(event.request.url).code ?? '');

const toShop = (world: World, method: WebRequest['method'], path: string, cookie: string, body: Record<string, string> = {}) =>
  world.send({ method, url: `${SHOP_ORIGIN}${path}`, headers: cookie ? { cookie } : {}, body }, 'evil');

/**
 * A look-alike sign-in page that passes what the victim types to the real shop as it arrives.
 * A code is relayed like a password. With no code, it asks the browser for a passkey on this page.
 */
const relay: Handler = (request, world) => {
  const { name = '', password = '', code } = request.body;
  const signIn = toShop(world, 'POST', '/signin', '', { name, password });
  const sid = signIn.setCookies.find((cookie) => cookie.name === 'sid')?.value;
  if (!sid) return response(401, 'The shop refused the password.');
  const cookie = `sid=${sid}`;
  if (code !== undefined) {
    const answer = toShop(world, 'POST', '/signin/code', cookie, { code });
    return answer.status === 200 ? response(200, sid) : response(401, 'The shop refused the code.');
  }
  const challenge = toShop(world, 'GET', '/signin/challenge', cookie).body;
  const signature = world.browser.passkeySign(EVIL_ORIGIN, challenge);
  if (signature === null) return response(401, 'The passkey will not sign for evil.example.');
  const answer = toShop(world, 'POST', '/signin/passkey', cookie, { signature: String(signature) });
  return answer.status === 200 ? response(200, sid) : response(401, 'The shop refused the passkey.');
};

export function createEvil(): Site {
  return {
    origin: EVIL_ORIGIN,
    party: 'evil',
    routes: [
      { method: 'GET', path: '/cb', handler: () => response(200, 'Thanks for the code.') },
      { method: 'POST', path: '/phish', handler: relay },
    ],
  };
}
