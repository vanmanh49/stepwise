import type { WebRequest } from './http';
import type { ShopOptions } from './shop';

/** The shop's own front end, on another origin of the same site. */
export const APP_ORIGIN = 'https://app.shop.example';

const METHODS = { 'access-control-allow-methods': 'GET, PUT' };
const CREDENTIALS = { 'access-control-allow-credentials': 'true' };

export function corsHeaders(cors: ShopOptions['cors'], request: WebRequest): Record<string, string> {
  if (cors === 'one') return { 'access-control-allow-origin': APP_ORIGIN, ...CREDENTIALS, ...METHODS };
  if (cors === 'reflect') return { 'access-control-allow-origin': request.headers.origin ?? '', ...CREDENTIALS, ...METHODS };
  if (cors === 'wildcard') return { 'access-control-allow-origin': '*', ...METHODS };
  return {};
}
