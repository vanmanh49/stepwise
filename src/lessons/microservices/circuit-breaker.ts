import { circuitBreakerCode, circuitBreakerSteps } from '../../microservices/scenarios/circuit-breaker';
import type { LessonContent } from '../../types/lesson';

const noBreaker = { breaker: 'off', threshold: '3', openMs: '150', recovers: '300', requests: '12' };
const withBreaker = { ...noBreaker, breaker: 'on' };

// The step just before the third timeout: the badge shows 2 of 3 failures, and the breaker is about to decide.
const breakerSteps = circuitBreakerSteps(withBreaker);
const beforeOpen = breakerSteps[breakerSteps.findIndex((s) => s.title.includes('opens after')) - 2]!;

const content: LessonContent = {
  overview:
    'When a service is down or hanging, every caller waits for its timeout, again and again, and keeps sending it work it cannot do. A circuit breaker notices the failures and stops calling for a while: calls fail at once instead. After a pause it lets one trial call through to see whether the service is back. This lesson sends payments requests through api while payments hangs for a while.',
  concept: [
    'A breaker sits in the caller, in front of one dependency. While it is closed, calls go through and it counts failures in a row.',
    'After a set number of failures in a row it opens. While it is open, calls fail at once without being sent: the caller saves its time, and the struggling service gets no extra load.',
    'After the open time it goes half-open and lets exactly one trial call through. If the trial works, the breaker closes again. If it fails, the breaker opens for another round.',
    'A breaker does not fix the failing service. It limits the damage: callers fail fast and can show a fallback, and the service gets room to recover.',
  ],
  howItWorks: [
    'The client sends POST /pay to api every 40 ms. api calls payments with a 100 ms timeout.',
    'payments hangs from 40 ms until it recovers: it accepts requests but never answers them.',
    'With the breaker on, api opens it after Threshold timeouts in a row and keeps it open for Open time.',
    'The badge on api shows the breaker: closed with its failure count, open, or half-open.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'breaker', label: 'Breaker', type: 'choice', sample: noBreaker.breaker, options: ['off', 'on'] },
      { name: 'threshold', label: 'Threshold', type: 'number', sample: noBreaker.threshold, help: 'Failures in a row before it opens. From 1 to 5.' },
      { name: 'openMs', label: 'Open time (ms)', type: 'number', sample: noBreaker.openMs, help: 'From 50 to 500.' },
      { name: 'recovers', label: 'Payments recovers at (ms)', type: 'number', sample: noBreaker.recovers, help: 'payments hangs from 40 ms until then. From 100 to 2000.' },
      { name: 'requests', label: 'Requests', type: 'number', sample: noBreaker.requests, help: 'From 4 to 16, one every 40 ms.' },
    ],
    presets: [
      { label: 'No breaker', values: noBreaker },
      { label: 'Breaker opens, then closes', values: withBreaker },
      { label: 'Payments stays down', values: { ...withBreaker, recovers: '2000' } },
    ],
    generate: circuitBreakerSteps,
    codeLabel: 'Pseudocode',
  },
  code: circuitBreakerCode,
  prosCons: {
    pros: ['Callers fail in milliseconds instead of waiting for every timeout', 'A failing service stops getting traffic it cannot handle', 'It tries again by itself, so it recovers without anyone stepping in'],
    cons: ['While it is open, requests fail even if the service has just recovered', 'A threshold set too low opens on a single unlucky failure', 'It needs a fallback plan for the calls it turns away'],
    useWhen: ['A dependency can be down or slow for a while', 'Waiting for timeouts would tie up the caller'],
    avoidWhen: ['Calls are cheap and failures are rare and short: retries are enough'],
  },
  applications: [
    'Resilience4j and Polly circuit breakers in Java and .NET services',
    'Service meshes such as Istio, which eject failing instances',
    'Payment and shipping integrations that show "try again later" instead of hanging',
  ],
  commonMistakes: [
    'One breaker for every dependency together, so one bad service blocks calls to the healthy ones.',
    'Letting many trial calls through when half-open, which floods the service as it recovers.',
    'Counting errors that are the caller\'s fault, such as 400 Bad Request, as failures.',
    'Opening the breaker but showing users a blank error instead of a fallback.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The breaker has counted 2 timeouts in a row (threshold 3), and api is still waiting on another call to payments. What happens when that call times out?',
      view: beforeOpen.view,
      options: ['The breaker opens, and the next calls fail at once', 'The breaker resets its count to 0', 'api sends the call again straight away', 'payments recovers'],
      answer: 0,
      explanation: 'That is the third failure in a row, which reaches the threshold, so the breaker opens.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'While the breaker is open, what happens to a new request for payments?',
      options: ['api fails it at once without calling payments', 'api waits for the full 100 ms timeout', 'api queues it until payments recovers', 'api sends it to payments anyway'],
      answer: 0,
      explanation: 'An open breaker turns calls away straight away. That is why those requests fail in 20 ms instead of 120 ms.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets a single call test whether payments is back?',
      code: "if (state === 'open') {\n  if (now() - openedAt < OPEN_MS) throw new CircuitOpen()\n  state = 'half-open'\n}",
      options: ["state = 'half-open'", 'throw new CircuitOpen()', "if (state === 'open') {", 'None: the breaker closes by itself'],
      answer: 0,
      explanation: 'Once the open time has passed, the breaker goes half-open and lets this one call through as a trial.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'payments is still down when the half-open trial is sent. What does the breaker do?',
      options: ['Opens again for another open time', 'Closes, because it tried', 'Stays half-open and lets every call through', 'Removes payments for good'],
      answer: 0,
      explanation: 'A failed trial shows the service is still unhealthy, so the breaker opens for another round before trying again.',
    },
  ],
  summary: [
    'A circuit breaker counts failures in a row to one dependency.',
    'When it opens, calls fail at once and the failing service gets a rest.',
    'After the open time, one trial call decides whether it closes or opens again.',
    'It makes failures fast; a fallback decides what the user sees.',
  ],
};

export default content;
