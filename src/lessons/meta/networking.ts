import type { LessonMeta } from '../../types/lesson';

/** Networking lessons in learning order: what pages need without loading a lesson. */
export const networkingMeta: LessonMeta[] = [
  {
    id: 'layers-encapsulation',
    title: 'Layers & Encapsulation',
    category: 'networking',
    difficulty: 'beginner',
    group: 'Link & Internet',
    description: 'Wrap a message in UDP, IP and Ethernet headers, work out the real IPv4 checksum, then corrupt a byte and watch it fail.',
    keywords: ['osi', 'tcp/ip', 'layers', 'encapsulation', 'header', 'payload', 'packet', 'frame', 'checksum', 'network stack'],
    prerequisites: [],
  },
  {
    id: 'ethernet-switching',
    title: 'Ethernet & Switches',
    category: 'networking',
    difficulty: 'beginner',
    group: 'Link & Internet',
    description: 'Watch a switch learn where each host is, flood what it doesn\'t know, and forget entries as they age.',
    keywords: ['ethernet', 'switch', 'mac address', 'mac table', 'flooding', 'forwarding', 'frame', 'lan', 'layer 2'],
    prerequisites: [],
  },
  {
    id: 'arp',
    title: 'ARP',
    category: 'networking',
    difficulty: 'beginner',
    group: 'Link & Internet',
    description: 'See how a host turns an IP address into a MAC address by asking everyone, and why the packet has to wait.',
    keywords: ['arp', 'address resolution protocol', 'mac address', 'arp cache', 'broadcast', 'who has', 'ip neigh'],
    prerequisites: ['ethernet-switching'],
  },
  {
    id: 'ip-subnets',
    title: 'IP Addresses & Subnets',
    category: 'networking',
    difficulty: 'beginner',
    group: 'Link & Internet',
    description: 'Type any address and prefix, work out its network, broadcast and hosts in bits, and see when a packet needs a gateway.',
    keywords: ['ip address', 'ipv4', 'subnet', 'cidr', 'subnet mask', 'prefix', 'network address', 'broadcast', 'gateway', 'ipv6'],
    prerequisites: [],
  },
];
