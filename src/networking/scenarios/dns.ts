import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { lookup } from '../app/dns';
import type { Frame } from '../packet';
import { simulate, type Command, type Fault, type SimEvent, type SimResult } from '../sim';
import { EMPTY, endWith, networkView, tableGrid, traceSteps } from '../steps';
import { dnsTree, RESOLVER_IP, WEB_QUIET } from './topology';

export const dnsCode = `// the stub on this machine
ask the resolver for the name
no answer in 1 s: ask again, up to 2 times

// the recursive resolver
if the name is cached and fresh: answer from the cache
server = the closest zone in the cache, else the root
loop:
  ask server about the name
  if it answers: cache it for its TTL, and reply
  if it refers: cache the referral, server = next
  if NXDOMAIN: reply NXDOMAIN`;

export const SCENES = ['Cold lookup', 'Cached', 'No such name', 'Lost query'];
export const NAMES = ['www.example.com', 'api.example.com', 'nothing.example.com'];

const LINES = {
  'dns-query': 'ask server about the name',
  'dns-referral': 'if it refers: cache the referral, server = next',
  'dns-answer': 'if it answers: cache it for its TTL, and reply',
  'dns-cached': 'if the name is cached and fresh: answer from the cache',
  'dns-nxdomain': 'if NXDOMAIN: reply NXDOMAIN',
  'dns-retry': 'no answer in 1 s: ask again, up to 2 times',
  'dns-failed': 'no answer in 1 s: ask again, up to 2 times',
};

const TITLE = "Can't look this up";
const SECOND_LOOKUP_MS = 5000;
const CACHE_TABLE = 4;

const isDns = (frame: Frame) => frame.payload.kind === 'ip' && frame.payload.payload.kind === 'udp' && typeof frame.payload.payload.data === 'object' && 'proto' in frame.payload.payload.data;

function closing(scene: string, name: string, answers: (string | undefined)[], run: SimResult) {
  const asked = run.events.filter(({ device, action }) => device === 'resolver' && action === 'dns-query').length;
  const [first] = answers;
  if (scene === SCENES[1] && first === undefined) return { title: `${name} failed twice`, why: `The resolver asked again for the second lookup, because failed names aren't cached here. Real resolvers keep a failed answer for a while too, which this run leaves out.` };
  if (scene === SCENES[1]) return { title: `The second lookup cost 0 queries`, why: `The first made ${asked} queries, and the second made 0 past the resolver, because the record is good for 60 s. A change to a name takes up to its TTL to reach everyone.` };
  if (first === undefined && scene === SCENES[3]) return { title: `${name}: NXDOMAIN, 1 s late`, why: 'The first query was lost, so the client asked again after 1 s. The answer that came back says this name doesn\'t exist, and that is a real answer, not a failure.' };
  if (first !== undefined && scene === SCENES[2]) return { title: `${name} is ${first}`, why: 'This name exists, so there is no NXDOMAIN here. Pick nothing.example.com to see one.' };
  if (first === undefined) return { title: `${name}: NXDOMAIN`, why: 'The client got a real answer: this name does not exist. The network worked fine, so there is nothing to retry.' };
  if (scene === SCENES[3]) return { title: `${name} is ${first}, 1 s late`, why: 'UDP noticed nothing. The client\'s own timer did all the work, and one lost packet cost a whole second.' };
  return { title: `${name} is ${first}`, why: `The resolver asked ${asked} servers, each knowing a little more of the name. The client asked one question.` };
}

export function dnsSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const name = readChoice(values, 'name', 'Name', NAMES);
  if (!name.ok) return refusal(TITLE, name.why, EMPTY);

  const { client, root, tld, auth, resolver, devices, links } = dnsTree();
  const answers: (string | undefined)[] = [];
  const ask = (at: number): Command => ({ at, device: client.id, run: (_, ctx) => lookup(ctx, client, RESOLVER_IP, name.value, (address) => answers.push(address)) });
  const faults: Fault[] = scene.value === SCENES[3] ? [{ kind: 'dropPacket', nth: 1, matches: (frame) => frame.srcMac === client.mac && isDns(frame) }] : [];
  const run = simulate({ devices, links, faults, commands: scene.value === SCENES[1] ? [ask(0), ask(SECOND_LOOKUP_MS)] : [ask(0)] });

  const panel = (event: SimEvent) => {
    const cache = event.tables.resolver?.[CACHE_TABLE];
    if (event.device === 'resolver' && cache) return { label: 'Resolver cache', view: tableGrid(cache, 'resolver') };
    return { label: 'Network', view: networkView(run, event, []) };
  };
  const steps = traceSteps(run, dnsCode, LINES, {
    hide: WEB_QUIET,
    ladder: [resolver, root, tld, auth].map((host) => ({ id: host.id, label: host.label, ip: host.address() })),
    panel,
  });
  return endWith(steps, closing(scene.value, name.value, answers, run));
}
