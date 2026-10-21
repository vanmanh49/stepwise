import { loadBalancingCode, loadBalancingSteps, STRATEGIES } from '../../microservices/scenarios/load-balancing';
import type { LessonContent } from '../../types/lesson';

const even = { strategy: 'round-robin', instances: '3', slow: 'none', health: 'off', dead: 'none' };
const slowLeast = { strategy: 'least-connections', instances: '3', slow: 'api-1', health: 'off', dead: 'none' };

// The step just before the fifth pick: api-1 is still busy, and the log doesn't give the answer away.
const slowSteps = loadBalancingSteps(slowLeast);
const fifthPick = slowSteps.filter((s) => s.title.startsWith('The balancer picks'))[4]!;
const pickStep = slowSteps[slowSteps.indexOf(fifthPick) - 1]!;

const content: LessonContent = {
  overview:
    'A service usually runs as several identical instances, and a load balancer decides which one gets each request. How it decides matters: taking turns is fair when every instance is equally fast, but piles work onto one that is slow or dead. This lesson sends the same requests with three strategies, one slow instance, and one instance that dies.',
  concept: [
    'Round robin takes the instances in turn: 1, 2, 3, 1, 2, 3… It needs no information and spreads requests evenly by count.',
    'Least connections sends each request to the instance with the fewest requests still in flight. A slow instance finishes later, so its count stays high and it gets fewer new requests.',
    'Random picks any instance. Over many requests it evens out, and it needs no shared counter, which helps when there are many balancers.',
    'A balancer cannot see that an instance has died unless it checks. Health checks probe every instance on a fixed beat and stop sending to those that do not answer. Between the death and the next failed probe, requests can still be lost.',
  ],
  howItWorks: [
    'The client sends 12 GET /items to the balancer, one every 10 ms.',
    'For each one, the balancer picks an instance with the chosen strategy and forwards the request. Each instance takes 20 ms, or 120 ms for a slow api-1.',
    'The badges show how many requests each instance has in flight when least connections is used.',
    'With health checks on, the balancer probes every instance every 25 ms and skips those marked down.',
    'With a dead instance, the last instance dies at 30 ms. Compare the failures with health checks off and on.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'strategy', label: 'Strategy', type: 'choice', sample: even.strategy, options: STRATEGIES },
      { name: 'instances', label: 'Instances', type: 'number', sample: even.instances, help: 'From 2 to 4.' },
      { name: 'slow', label: 'Slow instance', type: 'choice', sample: even.slow, options: ['none', 'api-1'], help: 'api-1 takes 120 ms instead of 20 ms.' },
      { name: 'health', label: 'Health checks', type: 'choice', sample: even.health, options: ['off', 'on'] },
      { name: 'dead', label: 'Dead instance', type: 'choice', sample: even.dead, options: ['none', 'last'], help: 'The last instance dies at 30 ms.' },
    ],
    presets: [
      { label: 'Round robin', values: even },
      { label: 'Slow instance, round robin', values: { ...even, slow: 'api-1' } },
      { label: 'Slow instance, least connections', values: slowLeast },
      { label: 'Health checks skip a dead instance', values: { ...even, health: 'on', dead: 'last' } },
    ],
    generate: loadBalancingSteps,
    codeLabel: 'Pseudocode',
  },
  code: loadBalancingCode,
  prosCons: {
    pros: ['Several instances share the work and one can fail without stopping the service', 'Least connections adapts to slow instances by itself', 'Health checks take dead instances out automatically'],
    cons: ['Round robin ignores how busy or slow an instance is', 'Least connections needs an accurate count of open requests', 'Health checks only notice a failure on their next beat'],
    useWhen: ['A service runs on more than one instance', 'Instances can be slow or fail independently'],
    avoidWhen: ['There is only one instance: there is nothing to balance'],
  },
  applications: [
    'Spreading web traffic over many servers behind one address',
    'Kubernetes services and cloud load balancers in front of containers',
    'Client-side balancing inside a service that calls another one',
  ],
  commonMistakes: [
    'Using round robin when instances have very different speeds.',
    'Turning health checks off, so a dead instance keeps getting its share.',
    'Probing so rarely that a dead instance gets traffic for a long time.',
    'Forgetting that the balancer itself must not be a single point of failure.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Least connections is in use and api-1 is slow (120 ms instead of 20 ms). Look at the in-flight badges. Where does the balancer send the next request?',
      view: pickStep.view,
      options: ['To an instance with the fewest requests in flight, not api-1', 'Always to api-1, because it is first', 'To all three instances at once', 'Back to the client'],
      answer: 0,
      explanation: 'api-1 is still holding its earlier requests, so its count is high. The balancer picks the instance with the lowest count.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With round robin and 3 instances, 12 requests arrive. api-3 died at the start and health checks are off. How many requests fail?',
      options: ['4: every request whose turn falls on api-3', '0: round robin skips dead instances', '12: one dead instance fails everything', '1: only the first one'],
      answer: 0,
      explanation: 'Round robin does not know api-3 is dead, so api-3 still gets every third request, and each one is refused.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line keeps a dead instance from getting more requests?',
      code: 'function onProbe(instance, answered) {\n  instance.down = !answered\n}\nconst healthy = instances.filter((i) => !i.down)',
      options: ['The filter on healthy instances, using what the probes found', 'return forward(instance, req)', 'turn++', 'None: dead instances always get requests'],
      answer: 0,
      explanation: 'A failed probe marks the instance down, and pick only chooses among instances that are not down.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why can a request still fail with health checks on?',
      options: ['The instance can die between two probes, before the balancer marks it down', 'Health checks slow the instances down', 'Probes take the request\'s place', 'The balancer ignores probe results'],
      answer: 0,
      explanation: 'Probes run on a beat. Until the next one fails, the balancer still believes the instance is healthy.',
    },
  ],
  summary: [
    'A load balancer spreads requests over the instances of a service.',
    'Round robin takes turns; least connections favours the least busy instance; random needs no shared state.',
    'A slow instance hurts round robin, while least connections steers around it.',
    'Health checks remove dead instances, but only after their next probe fails.',
  ],
};

export default content;
