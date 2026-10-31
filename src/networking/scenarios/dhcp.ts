import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { simulate, type Command, type Fault } from '../sim';
import { EMPTY, tableGrid, traceSteps } from '../steps';
import { QUIET } from './ip-routing';
import { dhcpNetwork } from './topology';

export const dhcpCode = `// client, with no address yet
broadcast Discover
on Offer: broadcast Request(ip)
on Ack: use ip, renew after lease / 2
no answer, twice: use a 169.254.x.x address

// server
on Discover:
  ip = lowest free address
  if no ip: say nothing
  send Offer(ip)
on Request: send Ack(ip, lease)`;

export const SCENES = ['First lease', 'Renewal', 'Pool exhausted', 'Server down'];

const LINES = {
  'dhcp-discover': 'broadcast Discover',
  'dhcp-retry': 'broadcast Discover',
  'dhcp-offer': 'send Offer(ip)',
  'dhcp-silent': 'if no ip: say nothing',
  'dhcp-request': 'on Offer: broadcast Request(ip)',
  'dhcp-renew': 'on Ack: use ip, renew after lease / 2',
  'dhcp-ack': 'on Request: send Ack(ip, lease)',
  'dhcp-bound': 'on Ack: use ip, renew after lease / 2',
  'dhcp-fallback': 'no answer, twice: use a 169.254.x.x address',
};

const TITLE = "Can't run this";
const SECOND_BOOT_MS = 10;
// Long enough for two renewals, at 50% and 100% of the lease.
const RENEWAL_RUN = 1.25;
const END_MS = 10_000;

export function dhcpSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const lease = readInt(values, 'lease', 'Lease time', { min: 10, max: 3600 });
  if (!lease.ok) return refusal(TITLE, lease.why, EMPTY);
  const pool = readInt(values, 'pool', 'Pool size', { min: 1, max: 2 });
  if (!pool.ok) return refusal(TITLE, pool.why, EMPTY);

  const { hosts, devices, links } = dhcpNetwork({ pool: pool.value, leaseS: lease.value });
  const [laptop, phone] = hosts;
  const commands: Command[] = [{ at: 0, device: laptop!.id, run: (_, ctx) => laptop!.boot(ctx) }];
  if (scene.value === SCENES[2]) commands.push({ at: SECOND_BOOT_MS, device: phone!.id, run: (_, ctx) => phone!.boot(ctx) });
  const faults: Fault[] = scene.value === SCENES[3] ? [{ at: 0, kind: 'stopDevice', device: 'dhcp' }] : [];
  const endAt = scene.value === SCENES[1] ? lease.value * 1000 * RENEWAL_RUN : END_MS;

  const run = simulate({ devices, links, commands, faults, endAt });
  return traceSteps(run, dhcpCode, LINES, {
    hide: [...QUIET, 'learn', 'flood', 'forward'],
    panel: (event) => {
      const table = event.tables.dhcp?.[0];
      return table && { label: 'Leases', view: tableGrid(table, 'dhcp') };
    },
  });
}
