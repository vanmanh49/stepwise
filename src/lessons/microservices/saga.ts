import { FAILURES, sagaCode, sagaSteps } from '../../microservices/scenarios/saga';
import type { LessonContent } from '../../types/lesson';

const allInStock = { saga: 'off', fails: 'none', orders: '3' };
const outOfStock = { ...allInStock, fails: 'inventory' };
const withSaga = { ...outOfStock, saga: 'on' };

// The step where inventory has just failed #2: payments already charged it.
const sagaRun = sagaSteps(withSaga);
const afterFailure = sagaRun[sagaRun.findIndex((s) => s.title === 'inventory-1 fails #2: out of stock')]!;

const content: LessonContent = {
  overview:
    'One order touches three services: orders saves it, payments charges the card, and inventory reserves the stock. Each has its own database, so there is no single transaction that can roll all three back. When the last step fails, the earlier ones have already happened. A saga makes each step undoable and, on a failure, runs the undo steps (compensations) newest first. This lesson makes order #2 fail and compares what is left behind.',
  concept: [
    'A saga is a sequence of local transactions, one per service. Each one commits on its own, so the others can see it at once.',
    'Every step that changes something has a compensation: a new step that cancels its effect. Refund undoes a charge; cancel undoes a pending order. A compensation does not erase history. It records the undo.',
    'Orchestration: one service (here, orders) tells each service what to do and runs the compensations when a step fails. Choreography: there is no conductor; each service reacts to the previous service\'s event and publishes its own, including failure events that trigger the undo. This lesson simulates orchestration.',
    'A saga gives eventual consistency, not isolation. Between the charge and the refund, anyone reading payments sees a charge for an order that will be cancelled.',
  ],
  howItWorks: [
    'The client places an order every 60 ms. orders saves it as pending, asks payments to charge it, asks inventory to reserve stock, then saves it as confirmed.',
    'Failing step makes order #2 fail: payments answers "card declined", or inventory answers "out of stock".',
    'With the saga on, orders undoes every step that already succeeded, newest first: /refund at payments, then the order is saved as cancelled. A step that failed itself needs no undo.',
    'Each database box shows its records. "inconsistent orders" counts failed orders that are still pending or still charged.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'saga', label: 'Saga', type: 'choice', sample: allInStock.saga, options: ['off', 'on'], help: 'On: each finished step is undone when a later one fails.' },
      { name: 'fails', label: 'Failing step', type: 'choice', sample: allInStock.fails, options: [...FAILURES], help: 'The step that fails for order #2.' },
      { name: 'orders', label: 'Orders', type: 'number', sample: allInStock.orders, help: 'From 1 to 4, one every 60 ms.' },
    ],
    presets: [
      { label: 'All in stock', values: allInStock },
      { label: 'Out of stock, no saga', values: outOfStock },
      { label: 'Out of stock, saga', values: withSaga },
      { label: 'Card declined, saga', values: { ...withSaga, fails: 'payment' } },
    ],
    generate: sagaSteps,
    codeLabel: 'Pseudocode',
  },
  code: sagaCode,
  prosCons: {
    pros: ['Keeps data consistent across services without a distributed lock or two-phase commit', 'Each service keeps its own database and its own transactions', 'A failure leaves a clear record of what was done and undone'],
    cons: ['Every step needs a compensation, written and tested like any other code', 'Other readers can see the half-done state before it is undone', 'Compensations can fail too, so they must be retried until they succeed'],
    useWhen: ['One business action changes data owned by several services', 'Each step can be undone by a later step, such as refund, cancel or release'],
    avoidWhen: ['The data lives in one database: use a normal transaction', 'A step cannot be undone, such as sending an email, unless it can go last'],
  },
  applications: [
    'Order checkout across orders, payments and inventory services',
    'Travel booking that reserves a flight, a hotel and a car, and cancels the rest if one fails',
    'Workflow engines such as Temporal or AWS Step Functions running compensations',
  ],
  commonMistakes: [
    'Undoing steps in the order they ran instead of newest first.',
    'Compensating the step that failed, which never took effect.',
    'Treating a compensation as a delete. A refund is a new record; the charge still happened.',
    'Forgetting that other services can read the intermediate state.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Inventory has just refused order #2: out of stock. The saga is on. What does orders do next?',
      view: afterFailure.view,
      options: ['Asks payments to refund #2', 'Saves #2 as cancelled first, then refunds', 'Retries inventory', 'Answers the client that #2 failed, leaving the charge'],
      answer: 0,
      explanation: 'Compensations run newest first. The payment was the last step that succeeded, so it is undone first; the order is cancelled after that.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without a saga, inventory fails order #2. What is left in the databases?',
      options: ['order #2 pending and charge #2 charged', 'Nothing for #2: the database rolls it back', 'order #2 cancelled and charge #2 refunded', 'Only order #2 confirmed'],
      answer: 0,
      explanation: 'Each service committed its own step. Nothing undoes them, so the customer paid for an order that will never ship.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes the undo run newest first?',
      code: 'for (const step of done.reverse()) {\n  await step.compensate(order)\n}',
      options: ['for (const step of done.reverse()) {', 'await step.compensate(order)', 'done.push(step)', 'throw error'],
      answer: 0,
      explanation: 'done holds the finished steps in the order they ran. Reversing it undoes the last one first.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'In a choreographed saga, who starts the refund when inventory fails?',
      options: ['Payments, when it sees an "out of stock" event', 'An orchestrator service', 'The database', 'The client'],
      answer: 0,
      explanation: 'With choreography there is no conductor. Inventory publishes a failure event, and payments reacts to it by refunding.',
    },
  ],
  summary: [
    'A saga splits one business action into local transactions, one per service.',
    'Each step has a compensation, and on a failure the finished steps are undone newest first.',
    'Orchestration uses one conductor; choreography lets services react to each other\'s events.',
    'Others can see the half-done state, so a saga is consistent only in the end.',
  ],
};

export default content;
