import { bulkheadCode, bulkheadSteps } from '../../microservices/scenarios/bulkhead';
import type { LessonContent } from '../../types/lesson';

const shared = { pools: 'shared', recs: 'slow', requests: '10' };

// The step just before checkout #6 is turned away: the shared pool already shows 4/4.
const sharedSteps = bulkheadSteps(shared);
const beforeShed = sharedSteps[sharedSteps.findIndex((s) => s.title.startsWith('api turns #6 away')) - 1]!;

const content: LessonContent = {
  overview:
    'A service can only do so many things at once: it has a limited number of threads, connections or slots. If one slow dependency is allowed to take all of them, everything else the service does stops too. A bulkhead splits the slots into separate pools, like the watertight compartments of a ship, so one flooded part does not sink the rest. This lesson sends recommendation and checkout requests through api while recommendations is slow.',
  concept: [
    'Every call api makes holds one slot until its answer comes back. A slow dependency holds its slots for a long time.',
    'With one shared pool, slow calls pile up until every slot is taken. Then calls to healthy services are turned away too, because there is no slot left for them.',
    'With a pool per dependency, a slow service can only fill its own pool. Calls to other services still find free slots.',
    'When a pool is full, the call fails at once with "bulkhead full". Failing fast is better than queueing behind calls that may take seconds.',
  ],
  howItWorks: [
    'The client sends GET /recs and POST /checkout in turn, one every 10 ms. api calls recs or checkout depending on the path.',
    'Shared means one pool of 4 slots for both calls. Separate means 2 slots for recs and 2 for checkout.',
    'Slow recommendations take 400 ms instead of 10 ms, so their slots stay busy.',
    'The badge on api shows how many slots each pool is using.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'pools', label: 'Pools', type: 'choice', sample: shared.pools, options: ['shared', 'separate'], help: 'Shared: 4 slots for both. Separate: 2 each.' },
      { name: 'recs', label: 'Recommendations', type: 'choice', sample: shared.recs, options: ['normal', 'slow'], help: 'Slow takes 400 ms instead of 10 ms.' },
      { name: 'requests', label: 'Requests', type: 'number', sample: shared.requests, help: 'From 2 to 12, alternating /recs and /checkout every 10 ms.' },
    ],
    presets: [
      { label: 'Shared pool, slow recommendations', values: shared },
      { label: 'Separate pools, slow recommendations', values: { ...shared, pools: 'separate' } },
      { label: 'Normal speed', values: { ...shared, recs: 'normal' } },
    ],
    generate: bulkheadSteps,
    codeLabel: 'Pseudocode',
  },
  code: bulkheadCode,
  prosCons: {
    pros: ['A slow dependency can no longer take every slot', 'Calls to healthy services keep working', 'A full pool fails at once instead of queueing'],
    cons: ['Slots in one pool sit idle while another pool is full', 'Pool sizes need tuning, and the right size changes with traffic', 'More pools mean more settings to watch'],
    useWhen: ['A service calls several dependencies that can slow down independently', 'Some calls matter more than others, such as checkout over recommendations'],
    avoidWhen: ['A service has a single dependency: there is nothing to keep apart'],
  },
  applications: [
    'Separate thread pools or connection pools per downstream service',
    'Resilience4j and Polly bulkheads that cap concurrent calls',
    'Kubernetes resource limits that keep one container from starving the others',
  ],
  commonMistakes: [
    'Sharing one connection pool between critical and optional calls.',
    'Making each pool so big that together they exceed what the service can handle.',
    'Queueing calls when a pool is full, so they wait behind slow ones anyway.',
    'Forgetting to free the slot when a call fails or times out.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Slow recommendation calls hold the shared pool (badge: pool 4/4). Checkout #6 needs a slot now. What happens?',
      view: beforeShed.view,
      options: ['api turns #6 away with "bulkhead full"', 'checkout #6 waits for a slot', 'api calls checkout anyway', 'recommendations speeds up'],
      answer: 0,
      explanation: 'Every slot in the shared pool is taken by a slow recommendation call, so the checkout call fails at once.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With separate pools (2 for recs, 2 for checkout), which requests fail while recommendations is slow?',
      options: ['Only some /recs requests', 'Only /checkout requests', 'Both kinds equally', 'None at all'],
      answer: 0,
      explanation: 'Slow recommendation calls can only fill the recs pool. Checkout has its own two slots, and its calls finish quickly.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes sure a slot is freed even when a call fails?',
      code: 'try {\n  return await send(service, req)\n} finally {\n  pool.release()\n}',
      options: ['pool.release() inside finally', 'return await send(service, req)', 'try {', 'None: slots free themselves'],
      answer: 0,
      explanation: 'finally runs whether the call succeeded or threw, so the slot always goes back to the pool.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is the cost of splitting 4 slots into two pools of 2?',
      options: ['Free slots in one pool cannot be used by the other', 'Every call gets slower', 'Checkout calls fail more often', 'Nothing at all'],
      answer: 0,
      explanation: 'If only recommendations are busy, they can use 2 slots, not 4. Isolation trades some capacity for safety.',
    },
  ],
  summary: [
    'Each call holds a slot until its answer comes back.',
    'One shared pool lets a slow dependency starve every other call.',
    'Separate pools keep a slow dependency\'s damage in its own pool.',
    'A full pool should fail fast, not queue.',
  ],
};

export default content;
