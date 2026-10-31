import { LOST, quicHttp3Code, quicHttp3Steps, VISITS } from '../../networking/scenarios/quic-http-3';
import type { LessonContent } from '../../types/lesson';

const defaults = { visit: 'First', resources: '4', lost: 'None' };
const lostPacket = { visit: 'First', resources: '4', lost: 'Packet 3' };
const hold = quicHttp3Steps(lostPacket).find((step) => step.title.includes('waits for bytes'))!;

const content: LessonContent = {
  overview:
    'HTTP/2 fixed the queue inside HTTP but kept TCP\'s: one lost segment stalls every stream. QUIC replaces TCP with a new transport on top of UDP, where streams are real and TLS is built in. This lesson runs it against the same path, the same sizes and the same Reno as HTTP/2.',
  concept: [
    'QUIC runs on UDP because routers and firewalls already pass UDP. Everything TCP does for reliability, QUIC does itself, in the endpoints. That also means it can change without waiting for every router on the internet.',
    'TCP needs a round trip of its own, and TLS needs another. QUIC puts both in one exchange: Initial, then the server\'s flight, then Finished with the requests beside it. Here the first byte arrives about one round trip before HTTP/2 on TLS, as the closing step measures.',
    'A client that has been here before keeps a key from the last visit. It can send its requests in the very first flight. That is 0-RTT, and it saves one more round trip. Real clients only use it for requests that are safe to repeat, because an attacker can replay them.',
    'Each frame names its stream and offset, and each stream delivers in order on its own. A lost packet leaves a gap in that stream only, so the others keep delivering. Compare the Streams panel here with the same loss on HTTP/2.',
    'A packet number is never reused. A resend gets a new number, so an ACK can\'t be mistaken for the old copy, and ACKs list ranges, so a gap is plain to see. A packet counts as lost once 3 later ones are acknowledged. Otherwise the timer catches it, on the same values as TCP. Congestion control is the same Reno code as TCP\'s, so this comparison is fair.',
    'The numbers are round on purpose: 8000-byte files, 1040-byte packets on the wire, the same as a TCP segment, and a server window of 3 packets. Handshake flights are 1200, 3000 and 100 bytes. Nothing here is really encrypted: see Certificates & TLS for what the handshake does. Moving between networks, flow control per stream, version negotiation and real header compression are left out. To see this on a real machine, run curl --http3 -v against a site that supports it.',
  ],
  howItWorks: [
    'The client sends Initial, which starts the connection and TLS together.',
    'The server answers with one flight, and the client sends Finished and its requests.',
    'A returning client sends requests in the first flight, with a saved key.',
    'Frames name their stream, and each stream delivers in order on its own.',
    'A lost packet stalls only its stream, and its data goes again under a new number.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'visit', label: 'Visit', type: 'choice', sample: defaults.visit, options: VISITS },
      { name: 'resources', label: 'Resources', type: 'number', sample: defaults.resources, help: 'From 2 to 6.' },
      { name: 'lost', label: 'Lost', type: 'choice', sample: defaults.lost, options: LOST, help: 'The nth packet carrying response data, counted as on HTTP/2.' },
    ],
    presets: [
      { label: 'Fresh connection', values: defaults },
      { label: 'Returning visit', values: { visit: 'Returning', resources: '4', lost: 'None' } },
      { label: 'Lost packet', values: lostPacket },
    ],
    generate: quicHttp3Steps,
    codeLabel: 'Pseudocode',
  },
  code: quicHttp3Code,
  prosCons: {
    pros: ['One round trip to the first request, and none on a return visit', 'A lost packet stalls only one stream', 'Can improve without changing routers'],
    cons: ['Some networks block or slow UDP', 'Costs more CPU than TCP in most stacks', '0-RTT requests can be replayed'],
    useWhen: ['Pages with many files, on mobile or lossy networks'],
    avoidWhen: ['Networks that block UDP, where clients fall back to HTTP/2 anyway'],
  },
  applications: [
    'Large sites and CDNs serve much of their traffic over HTTP/3',
    'Browsers race it against HTTP/2 and keep whichever works',
    'Video calls and streaming use QUIC to avoid stalls',
  ],
  commonMistakes: [
    'Thinking QUIC is unreliable because it runs on UDP. It adds its own acknowledgements and resends.',
    'Assuming 0-RTT is safe for any request. A replayed payment would be a disaster.',
    'Expecting a big gain on a clean, short link. The gains show up with distance and loss.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'One stream is missing a packet, and later packets have arrived. What can the other streams do?',
      view: hold.view,
      options: ['Keep delivering their own bytes', 'Wait for the resend, as on TCP', 'Start a new connection', 'Move to the stalled stream\'s window'],
      answer: 0,
      explanation: 'Each stream delivers in order on its own, so a gap in one says nothing about the others.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why can QUIC reach the first request a round trip sooner than TCP plus TLS?',
      options: ['Its transport and TLS handshakes are one exchange', 'UDP packets travel faster than TCP', 'It sends no acknowledgements', 'It skips the certificate'],
      answer: 0,
      explanation: 'TCP finishes its own handshake before TLS can start, and QUIC does both together.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes a QUIC ACK never ambiguous?',
      options: ['give it a new number, even if it repeats old data', 'name the stream and offset of every frame', 'acknowledge at once, listing ranges', 'if the timer runs out: resend, and double the timer'],
      answer: 0,
      explanation: 'A resend has a new number, so an ACK always says exactly which copy arrived.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does a returning client gain from 0-RTT?',
      options: ['Its request leaves in the first flight', 'It needs no acknowledgements', 'Its packets can\'t be lost', 'It gets a bigger window'],
      answer: 0,
      explanation: 'A saved key lets data go at once, so the first response comes a round trip sooner.',
    },
  ],
  summary: [
    'QUIC runs on UDP and does reliability itself, with TLS built in.',
    'One round trip sets up both, and 0-RTT skips even that on a return visit.',
    'Streams are real, so a lost packet stalls only one of them.',
    'New packet numbers and ACK ranges make loss detection precise.',
  ],
};

export default content;
