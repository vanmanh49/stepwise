import { readChoice, readText, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { parseIp } from '../address';
import { simulate } from '../sim';
import { EMPTY, traceSteps } from '../steps';
import { R1_R2_LINK, threeRouters } from './topology';

export const ipRoutingCode = `on packet(dst, ttl):
  if ttl <= 1:
    send Time Exceeded to the source
  best = longest prefix in the table matching dst
  if no best:
    send Destination Unreachable to the source
  ttl = ttl - 1
  frame = new frame to best.nextHop
  send(frame, best.port)`;

export const LINK_OPTIONS = ['Up', 'Down'];
export const ROUTE_OPTIONS = ['Correct', 'Loop'];

const LINES = {
  'ttl-expired': 'send Time Exceeded to the source',
  'route-match': 'best = longest prefix in the table matching dst',
  'no-route': 'send Destination Unreachable to the source',
  'forward-hop': 'send(frame, best.port)',
};

export const QUIET = ['arp-request', 'arp-reply', 'not-mine'];

const TITLE = "Can't send this packet";
const TTL = 8;

export function ipRoutingSteps(values: Record<string, string>): Step[] {
  const destination = readText(values, 'destination', 'Destination', { min: 1, max: 15 });
  if (!destination.ok) return refusal(TITLE, destination.why, EMPTY);
  const dst = parseIp(destination.value);
  if (!dst.ok) return refusal(TITLE, dst.why, EMPTY);
  const link = readChoice(values, 'link', 'R1–R2 link', LINK_OPTIONS);
  if (!link.ok) return refusal(TITLE, link.why, EMPTY);
  const routes = readChoice(values, 'routes', 'R2 routes', ROUTE_OPTIONS);
  if (!routes.ok) return refusal(TITLE, routes.why, EMPTY);

  const down = link.value === LINK_OPTIONS[1];
  const { host, devices, links } = threeRouters({ web: true, backup: down, loop: routes.value === ROUTE_OPTIONS[1] });
  const run = simulate({
    devices,
    links,
    commands: [{ at: 0, device: host.id, run: (_, ctx) => host.ping(ctx, dst.value, 1, TTL) }],
    faults: down ? [{ at: 0, kind: 'linkDown', link: R1_R2_LINK }] : [],
  });
  return traceSteps(run, ipRoutingCode, LINES, { hide: QUIET });
}
