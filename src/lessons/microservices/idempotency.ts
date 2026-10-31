import { DELIVERIES, idempotencyCode, idempotencySteps } from '../../microservices/scenarios/idempotency';
import type { LessonContent } from '../../types/lesson';

const atMostOnce = { delivery: 'at-most-once', lost: 'on', keys: 'off', payments: '3' };
const atLeastOnce = { ...atMostOnce, delivery: 'at-least-once' };

// The step just before the retry of #2 reaches payments: #2 has already been charged once.
const retrySteps = idempotencySteps(atLeastOnce);
const beforeRepeat = retrySteps[retrySteps.findIndex((s) => s.title.startsWith('#2 leaves the client') && s.variables?.t === '180 ms')]!;

const content: LessonContent = {
  overview:
    'Over a network, a missing answer does not mean nothing happened. The payment may have gone through and only the reply got lost. If the client gives up, the customer may be charged without knowing it. If it retries, the customer may be charged twice. An idempotency key lets the service recognise a repeat and answer it without charging again. This lesson loses the reply to payment #2 and tries all three choices.',
  concept: [
    'At most once: send the request once and never retry. Nothing happens twice, but a lost reply leaves the client thinking the payment failed when it went through.',
    'At least once: retry until an answer comes back. Nothing is lost, but if the first try worked and only its reply was lost, the work happens again: a double charge.',
    'An operation is idempotent when doing it twice has the same effect as doing it once. Setting a value is idempotent; adding money is not.',
    'An idempotency key makes a non-idempotent operation safe to retry. The client sends the same key on every try, and the service remembers the result for each key. A repeat gets the saved result instead of a new charge. At-least-once delivery plus idempotency gives an effect of exactly once.',
  ],
  howItWorks: [
    'The client sends POST /pay every 100 ms and waits up to 60 ms for each answer.',
    'payments charges the customer by writing to the ledger, then answers. With Lost reply on, the network drops payments\' first answer for #2.',
    'At least once retries up to 2 times, 20 ms after a failure. At most once never retries.',
    'With the idempotency key on, payments remembers each request it has finished and answers a repeat with the saved result. "charges" counts every charge the ledger made.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'delivery', label: 'Delivery', type: 'choice', sample: atMostOnce.delivery, options: [...DELIVERIES] },
      { name: 'lost', label: 'Lost reply', type: 'choice', sample: atMostOnce.lost, options: ['off', 'on'], help: 'The first answer to #2 never arrives.' },
      { name: 'keys', label: 'Idempotency key', type: 'choice', sample: atMostOnce.keys, options: ['off', 'on'] },
      { name: 'payments', label: 'Payments', type: 'number', sample: atMostOnce.payments, help: 'From 1 to 5, one every 100 ms.' },
    ],
    presets: [
      { label: 'At most once, reply lost', values: atMostOnce },
      { label: 'At least once, reply lost', values: atLeastOnce },
      { label: 'At least once with an idempotency key', values: { ...atLeastOnce, keys: 'on' } },
      { label: 'Nothing lost', values: { ...atLeastOnce, lost: 'off' } },
    ],
    generate: idempotencySteps,
    codeLabel: 'Pseudocode',
  },
  code: idempotencyCode,
  prosCons: {
    pros: ['Retries become safe, so lost replies no longer cause double charges', 'Clients can retry freely after timeouts and network errors', 'Works the same for retries and for a broker\'s redeliveries'],
    cons: ['The service must store a result for every key, and decide how long to keep it', 'Every client must send a stable key, the same on every try', 'A repeat that arrives while the first is still running needs handling too'],
    useWhen: ['A request changes something: payments, orders, sign-ups', 'Requests or messages can be retried or redelivered'],
    avoidWhen: ['The operation is already idempotent, such as reading data or setting a value'],
  },
  applications: [
    'Stripe\'s Idempotency-Key header on payment requests',
    'Message consumers that remember processed message ids',
    'Order systems that refuse a second order with the same order id',
  ],
  commonMistakes: [
    'Making a new key on every retry, so every try looks new.',
    'Treating a timeout as "nothing happened" and charging again without a key.',
    'Saving the key before the work is done, so a crash leaves a key with no charge.',
    'Forgetting that broker redelivery causes the same duplicates as client retries.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'payments charged #2, but its reply was lost. The client retries #2, without an idempotency key. What does payments do?',
      view: beforeRepeat.view,
      options: ['Charges the customer again', 'Notices the repeat and returns the saved result', 'Refuses the retry', 'Refunds the first charge'],
      answer: 0,
      explanation: 'Without a key, the retry looks like a brand new payment, so the ledger charges a second time.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'At most once, and the reply to #2 is lost. What does the customer see?',
      options: ['#2 failed, yet they were charged', '#2 succeeded and they were charged once', '#2 failed and they were not charged', 'They were charged twice'],
      answer: 0,
      explanation: 'The charge happened before the reply was lost. Without a retry, the client only knows it got no answer.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops a retry from charging twice?',
      code: 'if (seen.has(req.key)) {\n  return seen.get(req.key)\n}\nconst result = await ledger.charge(req.amount)\nseen.set(req.key, result)',
      options: ['if (seen.has(req.key)) {', 'await ledger.charge(req.amount)', 'seen.set(req.key, result)', 'None: retries always charge'],
      answer: 0,
      explanation: 'A request whose key was seen before gets the saved result, and the charge line never runs again.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What gives an effect of exactly once over an unreliable network?',
      options: ['At-least-once delivery plus an idempotent service', 'At-most-once delivery with no retries', 'A longer timeout on every call', 'Retrying faster'],
      answer: 0,
      explanation: 'Retries make sure the request gets through, and the idempotency key makes extra tries harmless.',
    },
  ],
  summary: [
    'A missing answer does not mean the work did not happen.',
    'At most once can lose work; at least once can do it twice.',
    'An idempotency key lets the service answer repeats with the saved result.',
    'At-least-once delivery plus idempotency gives an effect of exactly once.',
  ],
};

export default content;
