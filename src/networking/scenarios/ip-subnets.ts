import { readText, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, PanelsView, Role, Step } from '../../types/visualization';
import { broadcastOf, formatIp, inSubnet, mask, networkOf, parseCidr, parseIp } from '../address';
import { EMPTY } from '../steps';

export const ipSubnetsCode = `mask = ones(prefix) + zeros(32 - prefix)
network = address AND mask
broadcast = network OR (NOT mask)
hosts = 2 ^ (32 - prefix) - 2

if (other AND mask) == network:
  send directly
else:
  send to the gateway`;

const TITLE = "Can't work out this subnet";
const LENGTH = { min: 1, max: 18 };

const line = (snippet: string) => lineOf(ipSubnetsCode, snippet);

/** One row per octet, because 32 cells across would scroll on a phone. `|` falls where network bits end. */
function bitsGrid(ip: number, prefix: number, role: Role): GridView {
  return {
    kind: 'grid',
    colLabels: ['Value', 'Bits'],
    rows: formatIp(ip).split('.').map((octet, i) => {
      const bits = Number(octet).toString(2).padStart(8, '0');
      const cut = prefix - 8 * i;
      const shown = cut >= 0 && cut <= 8 && (cut > 0 || i === 0) ? `${bits.slice(0, cut)}|${bits.slice(cut)}` : bits;
      return { label: `Octet ${i + 1}`, cells: [{ id: `value-${i}`, value: octet, role: 'default' as Role }, { id: `bits-${i}`, value: shown, role }] };
    }),
  };
}

function resultsGrid(rows: [string, string][]): GridView {
  return { kind: 'grid', rows: rows.map(([label, value]) => ({ label, cells: [{ id: `result-${label}`, value, role: 'default' as Role }] })) };
}

export function ipSubnetsSteps(values: Record<string, string>): Step[] {
  const addressText = readText(values, 'address', 'Address', LENGTH);
  if (!addressText.ok) return refusal(TITLE, addressText.why, EMPTY);
  const otherText = readText(values, 'other', 'Second address', LENGTH);
  if (!otherText.ok) return refusal(TITLE, otherText.why, EMPTY);
  const block = parseCidr(addressText.value);
  if (!block.ok) return refusal(TITLE, block.why, EMPTY);
  const parsedOther = parseIp(otherText.value);
  if (!parsedOther.ok) return refusal(TITLE, parsedOther.why, EMPTY);

  const { ip, prefix } = block.value;
  const other = parsedOther.value;
  const network = networkOf(ip, prefix);
  const broadcast = broadcastOf(ip, prefix);
  const pointToPoint = prefix >= 31;
  const hostCount = prefix === 32 ? 1 : prefix === 31 ? 2 : 2 ** (32 - prefix) - 2;
  const first = pointToPoint ? network : network + 1;
  const last = prefix === 31 ? network + 1 : pointToPoint ? network : broadcast - 1;
  const cidr = `${formatIp(ip)}/${prefix}`;
  const results: [string, string][] = [];
  const panels = (shown: number, role: Role): PanelsView => ({
    kind: 'panels',
    panels: [
      { label: formatIp(shown), view: bitsGrid(shown, prefix, role) },
      ...(results.length > 0 ? [{ label: 'Worked out', view: resultsGrid(results) }] : []),
    ],
  });

  const steps: Step[] = [
    {
      title: `${cidr}: ${prefix} network bits, ${32 - prefix} host bits`,
      why: `An IPv4 address is 32 bits. The /${prefix} says the first ${prefix} name the network and the other ${32 - prefix} name a host on it.`,
      codeLine: line('mask = ones(prefix) + zeros(32 - prefix)'),
      view: panels(ip, 'default'),
    },
    {
      title: `The mask is ${formatIp(mask(prefix))}`,
      why: `The mask is ${prefix} ones then ${32 - prefix} zeros. The | marks where the network bits end.`,
      codeLine: line('mask = ones(prefix) + zeros(32 - prefix)'),
      view: panels(mask(prefix), 'active'),
    },
  ];
  results.push(['Network', formatIp(network)]);
  steps.push({
    title: `Network: ${formatIp(network)}`,
    why: 'AND keeps the network bits and clears the host bits. Every address on this subnet gives this same result.',
    codeLine: line('network = address AND mask'),
    view: panels(network, 'active'),
  });
  if (pointToPoint) {
    steps.push({
      title: `No broadcast address on a /${prefix}`,
      why: prefix === 31 ? 'A /31 is a link between exactly two machines, so RFC 3021 lets both addresses be hosts.' : 'A /32 names one single machine.',
      codeLine: line('broadcast = network OR (NOT mask)'),
      view: panels(network, 'default'),
    });
  } else {
    results.push(['Broadcast', formatIp(broadcast)]);
    steps.push({
      title: `Broadcast: ${formatIp(broadcast)}`,
      why: 'Setting every host bit gives the address that reaches every host on this subnet.',
      codeLine: line('broadcast = network OR (NOT mask)'),
      view: panels(broadcast, 'active'),
    });
  }
  results.push(['First host', formatIp(first)], ['Last host', formatIp(last)]);
  steps.push({
    title: `${hostCount} usable ${hostCount === 1 ? 'host' : 'hosts'}: ${formatIp(first)} to ${formatIp(last)}`,
    why: pointToPoint ? 'There is no network or broadcast address to set aside here.' : `${32 - prefix} host bits give 2^${32 - prefix} addresses. Two are set aside: the network and the broadcast.`,
    codeLine: line('hosts = 2 ^ (32 - prefix) - 2'),
    view: panels(ip, 'default'),
  });

  const local = inSubnet(other, network, prefix);
  const name = formatIp(other);
  const offLink = pointToPoint ? `${name} is not on this link` : `${name} is on another subnet, so it goes via the gateway`;
  steps.push({
    title: local ? `${name} is on this subnet, so it is sent directly` : offLink,
    why: local
      ? `${name} AND the mask gives ${formatIp(networkOf(other, prefix))}, the same network. The sender can reach it with ARP and one frame.`
      : `${name} AND the mask gives ${formatIp(networkOf(other, prefix))}, which is not ${formatIp(network)}. ${pointToPoint ? 'Nothing else shares this link.' : 'This one check is how every host decides whether a router is needed.'}`,
    codeLine: line(local ? 'send directly' : 'send to the gateway'),
    view: panels(other, local ? 'found' : 'discarded'),
  });
  return steps;
}
