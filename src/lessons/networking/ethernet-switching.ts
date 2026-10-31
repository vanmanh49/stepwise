import { ethernetSwitchingCode, ethernetSwitchingSteps, HOST_NAMES, SCENES } from '../../networking/scenarios/ethernet-switching';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, sender: 'A', receiver: 'B', aging: '300' };
const replyRun = ethernetSwitchingSteps({ ...defaults, scene: SCENES[1]! });
const beforeReply = replyRun[replyRun.findIndex((step) => step.title.startsWith('B sends'))]!;

const content: LessonContent = {
  overview:
    'Inside one network, frames are delivered by MAC address, and a switch decides which wire each frame goes down. Nobody tells a switch where anything is. It works that out by watching traffic. This lesson runs a switch with four hosts, so you can see it learn, flood, and forget.',
  concept: [
    'Every network card has a MAC address, written like aa:00:00:00:00:01. An Ethernet frame names a source MAC and a destination MAC. It only travels within one local network: MAC addresses mean nothing beyond the next router.',
    'A switch keeps a table of which MAC address sits on which port. It fills that table by itself: every frame that arrives shows where its sender is. This is why a switch works the moment you plug it in.',
    'When a frame arrives for a MAC it doesn\'t know, the switch floods it out of every other port. Every other host sees the frame and ignores it. Once the destination replies, the switch learns its port, and from then on frames go straight there.',
    'Entries age out. If nothing comes from an address for the aging time, the switch forgets it, because the host may have moved or gone. A host that moves is fixed sooner, as its next frame overwrites the old port.',
    'This simulation has one switch and four hosts, with an aging time you choose. Real switches default to about 300 seconds. It leaves out VLANs, the spanning tree protocol that stops loops between switches, and collisions, which modern full-duplex links don\'t have.',
    'To see this on a real machine, run bridge fdb show on Linux, which prints a software bridge\'s MAC table. A managed switch shows the same table through its own command line.',
  ],
  howItWorks: [
    'A frame arrives, and the switch records its source MAC against that port.',
    'The switch drops the destination\'s entry if it has aged out.',
    'If the destination is unknown, it floods out of every other port.',
    'If it is known, the frame goes out of that one port only.',
    'Other hosts see flooded frames and ignore any addressed to someone else.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES, help: 'What happens after the first frame.' },
      { name: 'sender', label: 'Sender', type: 'choice', sample: defaults.sender, options: HOST_NAMES },
      { name: 'receiver', label: 'Receiver', type: 'choice', sample: defaults.receiver, options: HOST_NAMES },
      { name: 'aging', label: 'Aging time (s)', type: 'number', sample: defaults.aging, help: 'From 1 to 600.' },
    ],
    presets: SCENES.map((scene) => ({ label: scene, values: { ...defaults, scene } })),
    generate: ethernetSwitchingSteps,
    codeLabel: 'Pseudocode',
  },
  code: ethernetSwitchingCode,
  prosCons: {
    pros: ['Needs no setup: it learns by watching traffic', 'Other hosts don\'t see traffic once addresses are known', 'Copes with hosts moving'],
    cons: ['Floods whenever it doesn\'t know a destination', 'Only works within one local network', 'The MAC table has a limited size'],
    useWhen: ['Connecting machines on one local network'],
    avoidWhen: ['You need to reach other networks: that takes a router'],
  },
  applications: [
    'Every office and home wired network runs on switches',
    'Data centres connect servers through switches at each rack',
    'Virtual machines and containers sit behind software bridges that do the same learning',
  ],
  commonMistakes: [
    'Thinking a MAC address reaches across the internet. It only matters on the local link.',
    'Assuming no other host can ever see your frames. Flooding shows them to everyone until the switch has learned.',
    'Confusing a switch with a router. A switch reads MAC addresses and a router reads IP addresses.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'A has already sent a frame to B, so the switch learned A\'s port. Now B replies to A. What does the switch do?',
      view: beforeReply.view,
      options: ['Forwards it to A\'s port only', 'Floods it to every other port', 'Drops it', 'Sends it back to B'],
      answer: 0,
      explanation: 'The switch learned A\'s port from A\'s first frame, so the reply needs no flood.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'How does a switch learn where a host is?',
      options: ['From the source MAC of frames it receives', 'From a list you type in', 'By asking each host', 'From the IP header'],
      answer: 0,
      explanation: 'Every frame carries its sender\'s MAC, and it arrives on a port, which is all a switch needs.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops a frame from going back out of the port it came in on?',
      options: ['send out of every port except inPort', 'table[src] = inPort', 'delete table[dst]', 'send(myMac, dstMac, data)'],
      answer: 0,
      explanation: 'A flood skips the arrival port, because the sender is already on that side.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why do entries age out?',
      options: ['A host may have moved or gone away', 'To save electricity', 'MAC addresses change every few minutes', 'To force a router update'],
      answer: 0,
      explanation: 'A stale entry would send frames down the wrong wire forever, so a switch forgets what it hasn\'t heard from.',
    },
  ],
  summary: [
    'A switch delivers frames by MAC address within one network.',
    'It learns ports from the source of each frame.',
    'An unknown destination is flooded to every other port.',
    'Entries age out, so moved or missing hosts don\'t stay wrong forever.',
  ],
};

export default content;
