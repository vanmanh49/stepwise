import { dhcpCode, dhcpSteps, SCENES } from '../../networking/scenarios/dhcp';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, lease: '60', pool: '4' };
const steps = dhcpSteps(defaults);
const offered = steps.find((step) => step.title.startsWith('Offer:'))!;

const content: LessonContent = {
  overview:
    'A laptop joins a network with no address, no idea who to ask, and no way to send a normal packet. DHCP gets it from nothing to a working address in four messages, and takes it back when it is no longer used. This lesson runs that exchange, a renewal, an empty pool, and a network with no server at all.',
  concept: [
    'Every host needs an IP address, a mask and a gateway, and typing those into every device doesn\'t scale. DHCP, the Dynamic Host Configuration Protocol, lets one server hand them out from a pool.',
    'The client starts with nothing, so it sends from 0.0.0.0 to 255.255.255.255, the one address that reaches everyone on the local network. The four messages are often remembered as DORA: Discover, Offer, Request and Ack.',
    'The client broadcasts a Discover. The server picks a free address and sends an Offer. The client broadcasts a Request for it, so that any other server learns which offer was taken. The server replies with an Ack, and only then may the client use the address.',
    'Addresses are leased, not given. At half the lease, the client asks the server directly to renew, and if the machine has gone, the address returns to the pool when the lease ends. If nobody answers at all, the host gives itself a 169.254.x.x link-local address, which reaches its neighbours and nothing else.',
    'This simulation hands out only an address, while real servers also send the mask, gateway and DNS servers. A real client retries for much longer than the one retry here, and picks its 169.254.x.x address at random, then checks that nobody else has it.',
    'To see this on a real machine, run dhclient -v on Linux or ipconfig /all on Windows, which shows your lease and when it ends. Seeing a 169.254 address on a machine means DHCP failed.',
  ],
  howItWorks: [
    'The client broadcasts a Discover from 0.0.0.0.',
    'The server holds the lowest free address and sends an Offer.',
    'The client broadcasts a Request for that address.',
    'The server records the lease and sends an Ack.',
    'At half the lease, the client renews directly with the server.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES },
      { name: 'lease', label: 'Lease time (s)', type: 'number', sample: defaults.lease, help: 'From 10 to 3600.' },
      { name: 'pool', label: 'Pool size', type: 'number', sample: defaults.pool, help: 'From 1 to 4. Pool exhausted always uses 1.' },
    ],
    presets: SCENES.map((scene) => ({ label: scene, values: { ...defaults, scene } })),
    generate: dhcpSteps,
    codeLabel: 'Pseudocode',
  },
  code: dhcpCode,
  prosCons: {
    pros: ['Devices join a network with no setup', 'Addresses come back to the pool when unused', 'One server can change settings for a whole network'],
    cons: ['No server means no working network for new devices', 'Anyone on the network can run a fake server', 'An address can change, which breaks anything that relies on it'],
    useWhen: ['Laptops, phones and other devices that come and go'],
    avoidWhen: ['Servers that need a stable address: use a static address or a reservation'],
  },
  applications: [
    'Every home router runs a DHCP server',
    'Cloud providers hand addresses to new virtual machines through DHCP',
    'Offices reserve fixed addresses for printers while still using DHCP',
  ],
  commonMistakes: [
    'Thinking an address is yours for good. It is a lease.',
    'Ignoring a 169.254 address, which means no DHCP server answered.',
    'Setting up two DHCP servers with overlapping pools.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The server has offered 10.0.0.100. What does the laptop do next?',
      view: offered.view,
      options: ['Broadcasts a Request for that address', 'Starts using the address at once', 'Sends a new Discover', 'Pings the server'],
      answer: 0,
      explanation: 'An Offer is only an offer. The client asks for it with a Request, and may only use it after the Ack.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does a Discover go to 255.255.255.255?',
      options: ['The client knows no server and has no address', 'It is faster than unicast', 'Routers need to see it', 'It is encrypted that way'],
      answer: 0,
      explanation: 'A broadcast is the only way to reach an unknown server when you have no address of your own.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes a client ask to keep its address?',
      options: ['on Ack: use ip, renew after lease / 2', 'broadcast Discover', 'ip = lowest free address', 'if no ip: say nothing'],
      answer: 0,
      explanation: 'Renewing at half the lease leaves plenty of time to try again before it ends.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A laptop shows the address 169.254.12.7. What happened?',
      options: ['No DHCP server answered', 'It won a long lease', 'It is on the public internet', 'Its gateway changed'],
      answer: 0,
      explanation: 'A host gives itself a link-local address only after hearing nothing from a DHCP server.',
    },
  ],
  summary: [
    'DHCP hands out addresses in four messages: Discover, Offer, Request, Ack.',
    'The client starts from 0.0.0.0 and broadcasts, as it knows nothing yet.',
    'Addresses are leased, and renewed at half the lease.',
    'With no server, a host falls back to a 169.254.x.x address.',
  ],
};

export default content;
