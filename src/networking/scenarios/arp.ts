import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { ipv4 } from '../address';
import { simulate } from '../sim';
import { EMPTY, traceSteps } from '../steps';
import { fourHosts } from './topology';

export const arpCode = `// sending to an IP on this subnet
mac = cache[ip]
if (mac is missing):
  hold(packet)
  broadcast("who has ip?")
  wait for a reply, up to 1 second
  if (no reply): give up
  cache[ip] = reply.mac
send(mac, packet)

// every host hears the question
if (question.ip == myIp):
  cache[question.senderIp] = question.senderMac
  reply(question.senderMac, myMac)`;

export const TARGETS = ['10.0.0.2', '10.0.0.3', '10.0.0.9'];
export const CACHE_OPTIONS = ['Empty', 'Already cached'];

const LINES = {
  local: 'mac = cache[ip]',
  'arp-hit': 'mac = cache[ip]',
  'arp-request': 'broadcast("who has ip?")',
  'arp-failed': 'if (no reply): give up',
  'arp-reply': 'reply(question.senderMac, myMac)',
  send: 'send(mac, packet)',
  'echo-reply': 'send(mac, packet)',
};

const TITLE = "Can't send this packet";

export function arpSteps(values: Record<string, string>): Step[] {
  const target = readChoice(values, 'target', 'Target', TARGETS);
  if (!target.ok) return refusal(TITLE, target.why, EMPTY);
  const cache = readChoice(values, 'cache', 'ARP cache', CACHE_OPTIONS);
  if (!cache.ok) return refusal(TITLE, cache.why, EMPTY);

  const { hosts, devices, links } = fourHosts({ known: cache.value === CACHE_OPTIONS[1] });
  const a = hosts[0]!;
  const run = simulate({ devices, links, commands: [{ at: 0, device: a.id, run: (_, ctx) => a.ping(ctx, ipv4(target.value), 1) }] });
  return traceSteps(run, arpCode, LINES);
}
