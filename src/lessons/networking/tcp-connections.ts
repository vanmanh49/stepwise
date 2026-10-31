import { CLOSERS, SCENES, tcpConnectionsCode, tcpConnectionsSteps } from '../../networking/scenarios/tcp-connections';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, closer: CLOSERS[0]! };
const synSent = tcpConnectionsSteps(defaults)[0]!;

const content: LessonContent = {
  overview:
    'TCP gives two programs a reliable stream of bytes, and it starts by agreeing that a conversation exists. Both sides pick numbers, prove that each direction works, and later close each direction on its own. This lesson follows every state of that life on a ladder of real segments.',
  concept: [
    'A TCP connection is state kept at the two ends. The network in between knows nothing about it. Four numbers name it: the two IP addresses and the two ports.',
    'Opening takes three segments. The client sends a SYN with its starting sequence number. The server answers with a SYN ACK, which acknowledges the client\'s number and carries its own. The client acknowledges that. Three segments are the fewest that let both sides know both directions work.',
    'An ACK number says "the next byte I expect". A SYN uses up one sequence number, so a SYN of 1000 is answered with ACK 1001.',
    'Closing takes four segments, because each direction closes on its own. One side sends a FIN, and the other acknowledges it. When that side is finished too, it sends its own FIN, and that is acknowledged in turn.',
    'The side that closed first waits in TIME_WAIT. Its last ACK could be lost, and then the other side will repeat its FIN. TIME_WAIT keeps the connection around to answer, and it stops old segments leaking into a new connection on the same ports.',
    'A SYN to a port with no listener gets an RST, and the program sees "connection refused" at once. A lost SYN gets no answer at all, so the client tries again when its timer runs out.',
    'The numbers are round on purpose: starting numbers 1000 and 5000, a 1 s retry, and a 2 s TIME_WAIT. Real starting numbers are random, and Linux waits 60 s in TIME_WAIT. Here each program closes as soon as it sees a FIN, and simultaneous open and close are left out. To see this on a real machine, run ss -t and watch the State column.',
  ],
  howItWorks: [
    'The client sends a SYN and enters SYN_SENT.',
    'The server, if something listens, answers with a SYN ACK and enters SYN_RCVD.',
    'The client acknowledges it, and both sides are ESTABLISHED.',
    'One side sends a FIN, and the other acknowledges and sends its own.',
    'The first side acknowledges that FIN and waits in TIME_WAIT before forgetting the connection.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES },
      { name: 'closer', label: 'Who closes first', type: 'choice', sample: defaults.closer, options: CLOSERS, help: 'Only matters in Handshake and close.' },
    ],
    presets: [
      { label: 'Handshake and close', values: defaults },
      { label: 'Server closes first', values: { ...defaults, closer: CLOSERS[1]! } },
      { label: 'Refused', values: { ...defaults, scene: SCENES[1]! } },
      { label: 'Lost SYN', values: { ...defaults, scene: SCENES[2]! } },
    ],
    generate: tcpConnectionsSteps,
    codeLabel: 'Pseudocode',
  },
  code: tcpConnectionsCode,
  prosCons: {
    pros: ['Both sides know the connection works before any data moves', 'Each direction closes on its own', 'A refused connection fails at once'],
    cons: ['One round trip before the first byte of data', 'TIME_WAIT keeps state after the connection ends', 'Each connection costs memory at both ends'],
    useWhen: ['Two programs need an ordered, reliable stream'],
    avoidWhen: ['Many short exchanges where a handshake each time costs too much. Reuse the connection instead'],
  },
  applications: [
    'HTTP, SSH and database protocols all begin with this handshake',
    'A port scanner reads SYN ACK as open and RST as closed',
    'A busy server shows many TIME_WAIT rows after closing connections first',
  ],
  commonMistakes: [
    'Thinking the network tracks connections. Only the two ends do, plus any firewall or NAT that chooses to.',
    'Treating many TIME_WAIT rows as a fault. They are normal on the side that closes first.',
    'Forgetting that SYN and FIN each use up one sequence number.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client has sent a SYN, and the server is listening on this port. What happens next?',
      view: synSent.view,
      options: ['The server sends a SYN ACK', 'The client sends data', 'The server sends an RST', 'The client sends an ACK'],
      answer: 0,
      explanation: 'The server acknowledges the client\'s number and sends its own in one segment.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which side ends up in TIME_WAIT?',
      options: ['The side that sent the first FIN', 'The side that received the first FIN', 'The client, always', 'Both sides, for safety'],
      answer: 0,
      explanation: 'Its last ACK could be lost, and only it can answer a repeated FIN.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line moves the client to ESTABLISHED?',
      options: ['client: on SYN ACK: send ACK', 'client: send SYN(seq = 1000)', 'server: on SYN: send SYN ACK', 'on FIN: send ACK, wait 2 s'],
      answer: 0,
      explanation: 'Once the server\'s SYN ACK arrives, the client has heard both directions work.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A client gets "connection refused" straight away. What came back from the server?',
      options: ['An RST', 'A SYN ACK with no data', 'Nothing, the timer ran out', 'A FIN'],
      answer: 0,
      explanation: 'An RST is an answer, so the client doesn\'t need to wait. Silence would give a timeout instead.',
    },
  ],
  summary: [
    'SYN, SYN ACK, ACK: three segments open a connection.',
    'Each direction closes on its own, so closing takes four.',
    'The side that closes first waits in TIME_WAIT.',
    'An RST refuses at once, and a lost SYN is resent by a timer.',
  ],
};

export default content;
