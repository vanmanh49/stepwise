import { hex } from '../crypto/bytes';
import type { Party } from './browser';
import type { ShopDb } from './db';
import { pathOf, response, type WebRequest, type WebResponse } from './http';
import type { World } from './world';

export type Handler = (request: WebRequest, world: World) => WebResponse;

export type Route = { method: WebRequest['method']; path: string | RegExp; handler: Handler };

export type Site = { origin: string; party: Party; routes: Route[]; db?: ShopDb };

export const randomHex = (world: World, length: number): string => hex(Uint8Array.from({ length }, () => Math.floor(world.random() * 256)));

export function handle(site: Site, request: WebRequest, world: World): WebResponse {
  const path = pathOf(request.url);
  const route = site.routes.find((r) => r.method === request.method && (typeof r.path === 'string' ? r.path === path : r.path.test(path)));
  return route ? route.handler(request, world) : response(404, 'Not found');
}
