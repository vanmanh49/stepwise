import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { ipv4 } from '../address';
import type { AsRouter } from '../app/bgp';
import { simulate, type Command, type Ctx, type Fault, type SimEvent } from '../sim';
import { EMPTY, endWith, tableGrid, traceSteps } from '../steps';
import { asNet, ORIGIN_LINK } from './topology';

export const bgpCode = `// on an UPDATE from a neighbour
if the path holds this AS: reject it
best = highest local preference
       then shortest AS_PATH
       then lowest neighbour AS

// passing the best route on
add this AS to the front of the path
a customer's route goes to everyone
anyone else's goes to customers only

// on a WITHDRAW or a dead neighbour
forget those routes, and choose again

// traffic
follow the longest matching prefix`;

export const SCENES = ['Shortest path', 'Link fails', 'Prepending', 'Hijack'];

const LINES = {
  'bgp-update': 'add this AS to the front of the path',
  'bgp-best': 'best = highest local preference',
  'bgp-loop': 'if the path holds this AS: reject it',
  'bgp-filtered': 'anyone else\'s goes to customers only',
  'bgp-withdraw': 'forget those routes, and choose again',
  'bgp-probe': 'follow the longest matching prefix',
  'bgp-delivered': 'follow the longest matching prefix',
};

const TITLE = "Can't run this";
const NETWORK = ipv4('203.0.113.0');
const ADDRESS = ipv4('203.0.113.10');
const SPECIFIC_PREFIX = 25;
const CHANGE_MS = 100;
const PROBE_MS = 200;
const PREPEND = 2;

export function bgpSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);

  const { routers, devices, links } = asNet({ prepend: scene.value === SCENES[2] ? PREPEND : 0 });
  const on = (id: string, at: number, run: (router: AsRouter, ctx: Ctx) => void): Command => ({ at, device: id, run: (_, ctx) => run(routers[id]!, ctx) });
  const commands = [on('origin', 0, (router, ctx) => router.announce(ctx, NETWORK, 24)), on('isp', PROBE_MS, (router, ctx) => router.probe(ctx, ADDRESS))];
  const faults: Fault[] = [];
  if (scene.value === SCENES[1]) {
    faults.push({ at: CHANGE_MS, kind: 'linkDown', link: ORIGIN_LINK });
    commands.push(on('ta', CHANGE_MS, (router, ctx) => router.peerDown(ctx, 'Origin')));
  }
  if (scene.value === SCENES[3]) commands.push(on('evil', CHANGE_MS, (router, ctx) => router.announce(ctx, NETWORK, SPECIFIC_PREFIX)));
  const run = simulate({ devices, links, commands, faults, maxEvents: 5000 });

  const panel = (event: SimEvent) => {
    const table = event.tables[event.device]?.[0];
    return table && { label: 'AS routes', view: tableGrid(table, event.device) };
  };
  const steps = traceSteps(run, bgpCode, LINES, { panel });
  const end = run.events.find(({ action }) => action === 'bgp-delivered');
  const deliveredTo = routers[end?.device ?? '']?.label ?? 'nobody';
  const path = routers.isp!.best(NETWORK, 24)?.join(' ') ?? '';
  const variables = { path, deliveredTo };
  if (scene.value === SCENES[1]) return endWith(steps, { title: `The ISP now reaches Origin through ${path}`, why: 'Transit A lost its link, so it could only offer a longer path through Transit B. The ISP compared that with what it had already heard, and moved to Transit B directly, with no one configuring anything.', variables });
  if (scene.value === SCENES[2]) return endWith(steps, { title: `Traffic moved to ${path}`, why: `Origin added its own number ${PREPEND} extra times towards Transit A. That path grew longer than the one through Transit B, so the ISP chose differently. It is a request, not an order: local preference still comes first.`, variables });
  if (scene.value === SCENES[3]) return endWith(steps, { title: `The probe ended at ${deliveredTo}`, why: `Origin's /24 is still announced, but the Hijacker's /${SPECIFIC_PREFIX} is more specific, and the longest prefix always wins. BGP believes what it is told, unless RPKI says otherwise.`, variables });
  return endWith(steps, { title: `The ISP reaches Origin through ${path}`, why: 'Each AS added its number to AS_PATH and passed the route on. Real BGP runs these messages over TCP port 179, which this run leaves out so the paths stay in view.', variables });
}
