import { synchronousCallsCode, synchronousCallsSteps } from '../../microservices/scenarios/synchronous-calls';
import type { LessonContent } from '../../types/lesson';

const chain = { depth: '3', hop: '10', slow: 'none', style: 'sequential' };
const slowChain = { depth: '3', hop: '10', slow: 'last', style: 'sequential' };

const slowStarts = synchronousCallsSteps(slowChain).find((s) => s.title === 's3-1 starts on #1')!;

const content: LessonContent = {
  overview:
    'When one service calls another and waits for the answer, the call is synchronous. It is the simplest way for services to talk, like a function call over the network. But the caller is stuck until the answer comes back, so delays add up along a chain. This lesson measures a request through a chain of services, with one slow service, and with calls made in parallel.',
  concept: [
    'A synchronous call has two network trips: the request going out and the answer coming back. The caller does nothing else for that request in between.',
    'When services call each other in a chain, the total time is the sum of every hop and every service\'s work. Three services with 10 ms hops and 5 ms of work each take 2 × 10 × 3 + 5 × 3 = 75 ms.',
    'If one service in the chain is slow, everyone upstream waits for it. Its delay becomes part of every caller\'s response time, all the way back to the user.',
    'When a service needs answers from several others that do not depend on each other, it can call them all at once. Then the total is set by the slowest branch, not by the sum of all of them.',
  ],
  howItWorks: [
    'The client sends one GET /page to s1 at time 0.',
    'Sequential: each service does 5 ms of work, then calls the next one and waits for its answer before replying.',
    'Parallel: s1 does its work, then calls every branch at once and replies when all of them have answered.',
    'With a slow service, the last service (or the last branch) takes 200 ms instead of 5 ms.',
    'Read the total time in the request table and compare it with the sum of the parts.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'depth', label: 'Depth', type: 'number', sample: chain.depth, help: 'Services in the chain, or branches in the fan-out: 1 to 4.' },
      { name: 'hop', label: 'Hop latency', type: 'number', sample: chain.hop, help: 'Milliseconds per network hop, from 1 to 50.' },
      { name: 'slow', label: 'Slow service', type: 'choice', sample: chain.slow, options: ['none', 'last'] },
      { name: 'style', label: 'Call style', type: 'choice', sample: chain.style, options: ['sequential', 'parallel'] },
    ],
    presets: [
      { label: 'Chain of 3', values: chain },
      { label: 'One slow service', values: slowChain },
      { label: 'Parallel fan-out', values: { depth: '3', hop: '10', slow: 'last', style: 'parallel' } },
    ],
    generate: synchronousCallsSteps,
    codeLabel: 'Pseudocode',
  },
  code: synchronousCallsCode,
  prosCons: {
    pros: ['Simple to write and to follow: it reads like a function call', 'The caller gets the answer, or the error, right away', 'Parallel calls cut waiting when the branches are independent'],
    cons: ['Every hop in a chain adds latency', 'A slow service slows down every caller upstream', 'A failure anywhere in the chain fails the whole request'],
    useWhen: ['The caller needs the answer before it can reply', 'Chains are short and the services are fast'],
    avoidWhen: ['Long chains of services calling services', 'The work can happen later, without the user waiting'],
  },
  applications: [
    'A product page that asks the price, stock and reviews services for its data',
    'Checking a payment before confirming an order',
    'Aggregator services that combine answers from several backends',
  ],
  commonMistakes: [
    'Building long call chains, so every request pays for every hop.',
    'Calling independent services one after another instead of in parallel.',
    'Forgetting that the slowest service sets the pace for everyone calling it.',
    'Treating a network call like a local function call that is always fast.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 's3, the last service in a chain of 3 with 10 ms hops, has just started on #1, and it takes 200 ms. s1 and s2 take 5 ms each. What total time will the client see?',
      view: slowStarts.view,
      options: ['270 ms', '210 ms', '75 ms', '200 ms'],
      answer: 0,
      explanation: '3 hops there and back are 60 ms, plus 5 + 5 + 200 ms of work: 270 ms. s1 and s2 wait the whole time.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 's1 calls three independent services. Each takes about 30 ms to answer. Roughly how long does s1 wait in total if it calls them in parallel?',
      options: ['About 30 ms', 'About 90 ms', 'About 10 ms', 'About 60 ms'],
      answer: 0,
      explanation: 'Parallel calls overlap, so s1 waits only as long as the slowest one.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why can this service not reply before next has answered?',
      code: 'async function handle(req) {\n  await work()\n  const answer = await call(next, req)\n  return answer\n}',
      options: ['await call(...) pauses the request until next replies', 'work() blocks the whole server', 'return answer runs first', 'The network forbids two messages at once'],
      answer: 0,
      explanation: 'The call is synchronous: the function waits for the reply before it can return.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What happens to the response time of a chain when one service in it becomes slow?',
      options: ['Every caller upstream gets slower by that amount', 'Only that service is slow; callers are unaffected', 'The chain skips the slow service', 'The client gets an answer early'],
      answer: 0,
      explanation: 'Each caller is waiting, so the delay is passed all the way back to the user.',
    },
  ],
  summary: [
    'A synchronous call waits for the answer: one trip out, one trip back.',
    'Along a chain, every hop and every service\'s work add up.',
    'One slow service slows everyone who calls it.',
    'Independent calls made in parallel cost only as much as the slowest one.',
  ],
};

export default content;
