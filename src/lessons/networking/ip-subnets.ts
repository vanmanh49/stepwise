import { ipSubnetsCode, ipSubnetsSteps } from '../../networking/scenarios/ip-subnets';
import type { LessonContent } from '../../types/lesson';

const defaults = { address: '192.168.1.10/24', other: '192.168.1.77' };
const steps = ipSubnetsSteps({ address: '10.0.12.7/20', other: '10.0.15.200' });
const beforeNetwork = steps[1]!;

const content: LessonContent = {
  overview:
    'An IP address is a 32-bit number with two parts: which network, and which host on it. The number after the slash says where one ends and the other begins. This lesson works through any address you type, in bits, and ends with the one check every host makes before it sends a packet.',
  concept: [
    'An IPv4 address is 32 bits, written as four numbers from 0 to 255. The notation 192.168.1.10/24 says the first 24 bits name the network and the remaining 8 name a host. This way of writing it is called CIDR.',
    'A mask turns the prefix into a pattern of ones and zeros. AND-ing an address with the mask clears its host bits and leaves the network address. Setting every host bit instead gives the broadcast address, which reaches everyone on the subnet.',
    'Those two addresses are set aside, so a /24 has 256 addresses and 254 hosts. A /20 has 4,096 addresses and 4,094 hosts. Two prefixes are special: a /31 is a link between exactly two machines with no broadcast, and a /32 names one machine.',
    'Before every send, a host applies its mask to the destination. If the result equals its own network, the destination is on the same link and it can use ARP to reach it directly. If not, the packet goes to the default gateway, a router. Almost every "can\'t reach it" puzzle on a local network comes down to this check.',
    'Some ranges are private: 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 are free to reuse in any building, and don\'t work on the public internet. IPv6 uses the same idea, network bits then host bits, with 128-bit addresses, so most subnets are a /64 and there is no broadcast at all.',
    'To see this on a real machine, run ip addr on Linux, which prints each address with its prefix, or use ipcalc to work out any block.',
  ],
  howItWorks: [
    'Split the address at the prefix into network bits and host bits.',
    'AND the address with the mask to get the network address.',
    'Set all the host bits to get the broadcast address.',
    'Count 2^(host bits) addresses and set two aside.',
    'Mask the destination and compare: the same network is sent directly, and any other goes to the gateway.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'address', label: 'Address / prefix', type: 'text', sample: defaults.address, help: 'For example 10.0.12.7/20.' },
      { name: 'other', label: 'Second address', type: 'text', sample: defaults.other, help: 'Is it on the same subnet?' },
    ],
    presets: [
      { label: '/24', values: defaults },
      { label: '/20', values: { address: '10.0.12.7/20', other: '10.0.15.200' } },
      { label: '/31', values: { address: '10.0.0.0/31', other: '10.0.0.1' } },
      { label: 'Different subnets', values: { address: '192.168.1.10/24', other: '192.168.2.10' } },
    ],
    generate: ipSubnetsSteps,
    codeLabel: 'Pseudocode',
  },
  code: ipSubnetsCode,
  prosCons: {
    pros: ['One prefix can describe a huge group of addresses', 'A single mask check decides local or remote', 'Blocks can be any size, not just /8, /16 or /24'],
    cons: ['IPv4 has run out of unused public addresses', 'Bit boundaries inside an octet are hard to read', 'Two hosts with different masks can disagree about what is local'],
    useWhen: ['Planning addresses for a network', 'Working out why two machines can\'t talk'],
    avoidWhen: ['Splitting a large network by hand with no plan: it wastes addresses'],
  },
  applications: [
    'Cloud networks are built from subnets you carve out of a block',
    'Firewall rules and security groups match on CIDR blocks',
    'Kubernetes gives each pod and service an address from its own block',
  ],
  commonMistakes: [
    'Giving a host the network or broadcast address of its subnet.',
    'Setting a wrong mask, which makes a host think a neighbour is remote, or the reverse.',
    'Assuming the boundary always falls on a dot. In a /20 it falls inside the third number.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'For 10.0.12.7/20, the mask is 255.255.240.0. What is the network address?',
      view: beforeNetwork.view,
      options: ['10.0.0.0', '10.0.12.0', '10.0.12.7', '10.0.15.255'],
      answer: 0,
      explanation: 'The third number is 12, or 0000 1100 in bits. Only the first 4 of those bits are network bits, and they are all zero, so the result is 0.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'How many usable hosts does a /26 have?',
      options: ['62', '64', '126', '254'],
      answer: 0,
      explanation: '6 host bits give 64 addresses. Set aside the network and the broadcast and 62 remain.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line decides whether a packet needs the gateway?',
      options: ['if (other AND mask) == network:', 'broadcast = network OR (NOT mask)', 'hosts = 2 ^ (32 - prefix) - 2', 'mask = ones(prefix) + zeros(32 - prefix)'],
      answer: 0,
      explanation: 'A host masks the destination and compares it with its own network. A mismatch means a router is needed.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A host is 192.168.1.10/24. Is 192.168.2.10 on its subnet?',
      options: ['No, the first 24 bits differ', 'Yes, both start with 192.168', 'Yes, both are private', 'Only if the gateway agrees'],
      answer: 0,
      explanation: 'A /24 compares the first three numbers, and 192.168.1 is not 192.168.2.',
    },
  ],
  summary: [
    'The prefix splits an address into network bits and host bits.',
    'AND with the mask gives the network, and setting the host bits gives the broadcast.',
    'A subnet has 2^(host bits) addresses, minus two.',
    'Every host masks the destination to choose between direct delivery and the gateway.',
  ],
};

export default content;
