import { ipv4 } from '../address';
import { createHost, createSwitch, type Host, type HostConfig } from '../devices';
import type { Link } from '../sim';
import type { Device } from '../sim';

export const macOf = (n: number) => `aa:00:00:00:00:${n.toString(16).padStart(2, '0')}`;

const LAN = ['A', 'B', 'C', 'D'];

export interface Lan {
  hosts: Host[];
  devices: Device[];
  links: Link[];
}

/** Hosts A–D at 10.0.0.1–4 on one switch, with a spare port p5. `known` starts every host with the others' MACs. */
export function fourHosts({ agingS = 300, known = false }: { agingS?: number; known?: boolean } = {}): Lan {
  const everyone = LAN.map((_, i) => [ipv4(`10.0.0.${i + 1}`), macOf(i + 1)] as const);
  const hosts = LAN.map((name, i): Host => {
    const config: HostConfig = { id: name, label: name, column: i < 2 ? 0 : 2, mac: macOf(i + 1), ip: ipv4(`10.0.0.${i + 1}`), prefix: 24 };
    return createHost(known ? { ...config, arp: Object.fromEntries(everyone.filter(([, mac]) => mac !== config.mac)) } : config);
  });
  const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3', 'p4', 'p5'], agingS });
  return { hosts, devices: [...hosts, sw], links: hosts.map((host, i) => ({ a: [host.id, 'eth0'], b: ['sw', `p${i + 1}`] })) };
}
