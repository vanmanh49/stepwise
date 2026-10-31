import { APPROACHES, FAULTS, transactionalOutboxCode, transactionalOutboxSteps } from '../../microservices/scenarios/transactional-outbox';
import type { LessonContent } from '../../types/lesson';

const saveThenPublish = { approach: 'save-then-publish', fault: 'crash', orders: '3' };
const outboxCrash = { ...saveThenPublish, approach: 'outbox' };

// The step where orders-1 has just crashed after saving #2 and its outbox row.
const outboxRun = transactionalOutboxSteps(outboxCrash);
const afterCrash = outboxRun[outboxRun.findIndex((s) => s.title === 'orders crashes right after orders-db answers')]!;

const content: LessonContent = {
  overview:
    'When an order is placed, orders must do two things: save the order, and tell everyone else with an OrderPlaced event. The database and the broker are two different systems, and no transaction covers both. A crash between the two writes leaves them disagreeing: an order nobody hears about, or an event for an order that was never saved. The transactional outbox saves the event in the same database transaction as the order, and a separate relay publishes it later.',
  concept: [
    'A dual write is any code that writes to two systems one after the other, such as a database and a message broker. Whatever order you pick, a crash or failure in between leaves one written and the other not.',
    'Save then publish loses events: the order exists, but no other service ever learns about it. Publish then save creates ghost events: other services act on an order that does not exist.',
    'The outbox is a table in the service\'s own database. The order row and the outbox row are written in one local transaction, so both exist or neither does.',
    'A relay (a poller, or change data capture reading the database log) publishes each outbox row and deletes it only after the broker has stored it. If the relay dies in between, it publishes the row again, so delivery is at least once and consumers must be idempotent.',
  ],
  howItWorks: [
    'The client places an order every 50 ms. email consumes OrderPlaced events from the events broker.',
    'Approach picks the order of the two writes, or the outbox, where orders writes the order and an outbox/ record in one query and a relay polls every 40 ms.',
    'Crash makes orders-1 crash right after its first call for #2 and restart 10 ms later. Db down takes orders-db down at 60 ms.',
    '"saved" counts the orders in orders-db and "published" counts the events the broker stored. When they differ, the systems disagree.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'approach', label: 'Approach', type: 'choice', sample: saveThenPublish.approach, options: [...APPROACHES] },
      { name: 'fault', label: 'Fault', type: 'choice', sample: saveThenPublish.fault, options: [...FAULTS], help: 'crash: orders-1 dies after its first call for #2. db-down: orders-db fails from 60 ms.' },
      { name: 'orders', label: 'Orders', type: 'number', sample: saveThenPublish.orders, help: 'From 1 to 5, one every 50 ms.' },
    ],
    presets: [
      { label: 'Save then publish, crash', values: saveThenPublish },
      { label: 'Publish then save, db down', values: { ...saveThenPublish, approach: 'publish-then-save', fault: 'db-down' } },
      { label: 'Outbox, crash', values: outboxCrash },
      { label: 'Outbox, no fault', values: { ...outboxCrash, fault: 'none' } },
    ],
    generate: transactionalOutboxSteps,
    codeLabel: 'Pseudocode',
  },
  code: transactionalOutboxCode,
  prosCons: {
    pros: ['The order and its event are saved together or not at all', 'Uses only the local database transaction the service already has', 'The broker can be down for a while: events wait in the outbox'],
    cons: ['Events are delayed until the relay\'s next poll', 'Delivery is at least once, so consumers must ignore duplicates', 'One more moving part to run and watch: the relay'],
    useWhen: ['A service must change its data and publish an event about it', 'Losing or inventing an event would break other services'],
    avoidWhen: ['Nothing else needs to hear about the change', 'The event store is the database itself, as in event sourcing'],
  },
  applications: [
    'Order and payment services publishing domain events to Kafka or RabbitMQ',
    'Debezium reading the outbox table from the database log (change data capture)',
    'Frameworks such as NServiceBus and MassTransit with a built-in outbox',
  ],
  commonMistakes: [
    'Publishing inside the database transaction: the broker call can succeed while the transaction rolls back.',
    'Deleting the outbox row before the broker confirms it stored the event.',
    'Assuming each event arrives exactly once. A relay that restarts publishes again.',
    'Letting the outbox grow forever when the relay is down, with no alert.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'With the outbox, orders-1 crashed right after saving #2 and its outbox row. What happens to the OrderPlaced event for #2?',
      view: afterCrash.view,
      options: ['The relay finds the row on its next poll and publishes it', 'It is lost, because orders never called the broker', 'The client must place the order again', 'The broker asks orders for it'],
      answer: 0,
      explanation: 'The event was saved in the same write as the order. The relay reads outbox rows on its own schedule, so the crash doesn\'t matter.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Publish then save, and the database goes down. What does email see?',
      options: ['OrderPlaced events for orders that were never saved', 'Nothing at all, since the order was not saved', 'Every event twice, once per retry', 'Only the saved orders'],
      answer: 0,
      explanation: 'The events went out first, then the saves failed. Other services now act on ghost orders.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes the order and its event atomic?',
      code: "await db.transaction(async (tx) => {\n  await tx.insert('orders', req.order)\n  await tx.insert('outbox', { event: 'OrderPlaced', order: req.order })\n})",
      options: ['await db.transaction(async (tx) => {', "await tx.insert('orders', req.order)", "await tx.insert('outbox', …)", 'None: two inserts are never atomic'],
      answer: 0,
      explanation: 'Both inserts run inside one local transaction, so they commit together or not at all.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why must consumers of outbox events be idempotent?',
      options: ['The relay can publish a row again if it fails before deleting it', 'The outbox reorders events', 'The broker always sends two copies', 'The order table can be rolled back'],
      answer: 0,
      explanation: 'The relay deletes a row only after the broker stored it. A crash in between means the next poll publishes it again.',
    },
  ],
  summary: [
    'Writing to a database and a broker one after the other is a dual write; a crash in between breaks it.',
    'The outbox saves the event in the same local transaction as the data.',
    'A relay publishes outbox rows and deletes them once the broker has stored them.',
    'Delivery is at least once, so consumers should ignore repeats.',
  ],
};

export default content;
