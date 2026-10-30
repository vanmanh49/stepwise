export type WebRequest = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: Record<string, string> };

export type SetCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  maxAge?: number;
};

export type WebResponse = { status: number; headers: Record<string, string>; setCookies: SetCookie[]; body: string; redirect?: string };

export const response = (status: number, body = '', extra: Partial<WebResponse> = {}): WebResponse => ({ status, headers: {}, setCookies: [], body, ...extra });

const PARTS = /^(https?:)\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/;

export const hostOf = (url: string): string => PARTS.exec(url)?.[2] ?? '';

export const originOf = (url: string): string => {
  const parts = PARTS.exec(url);
  return parts ? `${parts[1]}//${parts[2]}` : '';
};

/** The registrable part of a host. Good enough for `.example` names, which have no public suffix to look up. */
export const siteOf = (host: string): string => host.split('.').slice(-2).join('.');

export const pathOf = (url: string): string => PARTS.exec(url)?.[3] || '/';

export const queryOf = (url: string): Record<string, string> => Object.fromEntries(new URLSearchParams(PARTS.exec(url)?.[4] ?? ''));

export const cookieHeader = (cookies: Record<string, string>): string =>
  Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

/** The cookies on a request, read from its `cookie` header. */
export function cookiesOf(request: WebRequest): Record<string, string> {
  const pairs = (request.headers.cookie ?? '').split('; ').filter(Boolean);
  return Object.fromEntries(pairs.map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)]));
}
