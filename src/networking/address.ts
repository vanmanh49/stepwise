import type { Read } from '../algorithms/form';

const OCTET = /^(0|[1-9]\d{0,2})$/;
const PREFIX = /^(0|[1-9]\d?)$/;

export function parseIp(text: string): Read<number> {
  const parts = text.trim().split('.');
  const octets = parts.map(Number);
  if (parts.length !== 4 || !parts.every((part) => OCTET.test(part)) || octets.some((octet) => octet > 255)) {
    return { ok: false, why: `"${text.slice(0, 20)}" is not an IPv4 address. Use four numbers from 0 to 255 with dots, like 192.168.1.10.` };
  }
  return { ok: true, value: octets.reduce((value, octet) => value * 256 + octet, 0) };
}

export function parseCidr(text: string): Read<{ ip: number; prefix: number }> {
  const [address = '', prefix, ...rest] = text.trim().split('/');
  const ip = parseIp(address);
  if (!ip.ok) return ip;
  if (prefix === undefined || rest.length > 0 || !PREFIX.test(prefix) || Number(prefix) > 32) {
    return { ok: false, why: `"${text.slice(0, 20)}" needs a prefix from 0 to 32 after a slash, like 192.168.1.10/24.` };
  }
  return { ok: true, value: { ip: ip.value, prefix: Number(prefix) } };
}

export const formatIp = (ip: number) => [ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.');

// A shift by 32 is a shift by 0 in JavaScript, so /0 needs its own case.
export const mask = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

export const networkOf = (ip: number, prefix: number) => (ip & mask(prefix)) >>> 0;

export const broadcastOf = (ip: number, prefix: number) => (ip | ~mask(prefix)) >>> 0;

export const inSubnet = (ip: number, network: number, prefix: number) => networkOf(ip, prefix) === networkOf(network, prefix);
