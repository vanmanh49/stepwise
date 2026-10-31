import { response } from './http';
import type { Site } from './site';

export const INTERNAL_HOSTS = ['metadata.internal', '169.254.169.254', 'admin.internal'];

/** A server-only site, like a cloud metadata service. `world.send` refuses anyone but the shop. */
export function createInternal(): Site {
  return {
    origin: `http://${INTERNAL_HOSTS[0]}`,
    party: 'internal',
    hosts: INTERNAL_HOSTS.slice(1),
    routes: [
      { method: 'GET', path: '/', handler: () => response(200, 'Internal admin console') },
      { method: 'GET', path: '/latest/credentials', handler: () => response(200, 'AccessKeyId=FAKEKEY123\nSecretAccessKey=fake-secret-key') },
    ],
  };
}

export const IMAGES_HOST = 'images.example';

/** The one host on the shop's preview allow-list. `/moved` shows why it must follow no redirect. */
export function createImages(): Site {
  return {
    origin: `https://${IMAGES_HOST}`,
    party: 'images',
    routes: [
      { method: 'GET', path: '/cat.png', handler: () => response(200, 'A small picture of a cat', { headers: { 'content-type': 'image/png' } }) },
      { method: 'GET', path: '/moved', handler: () => response(302, '', { redirect: `http://${INTERNAL_HOSTS[0]}/latest/credentials` }) },
    ],
  };
}
