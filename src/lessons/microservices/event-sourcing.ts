import { eventSourcingCode, eventSourcingSteps, SNAPSHOTS } from '../../microservices/scenarios/event-sourcing';
import type { LessonContent } from '../../types/lesson';

const state = { store: 'state', operations: '8', snapshot: 'off' };
const events = { ...state, store: 'events' };

// The step where the balance read has just reached the event store.
const eventRun = eventSourcingSteps(events);
const beforeReplay = eventRun[eventRun.findIndex((s) => s.title === 'account-db starts on #9')]!;

const content: LessonContent = {
  overview:
    'Most services store the current state: the balance is 160, and that is all the database knows. Event sourcing stores what happened instead: +50, −20, +100… The current state is worked out by replaying those events. You get the full history for free, and can answer questions you didn\'t think of when you built it. The price is that reading the state means replaying events, so long histories use snapshots.',
  concept: [
    'An event is a fact in the past tense: "50 was deposited". Events are only ever appended, never changed or deleted. The event store is the source of truth.',
    'State is derived: fold the events from the first to the last and you get the balance. Any other view, such as a monthly statement, can be built from the same events.',
    'Replaying costs time in proportion to the number of events. A snapshot stores the total at some point, so a read only replays the events after it.',
    'Fixing a mistake means appending a correcting event, not editing an old one. The history shows both the mistake and the fix.',
  ],
  howItWorks: [
    'The client sends Operations deposits and withdrawals to account, one every 20 ms, cycling +50, −20, +100, −30, +10, +20. Then it reads the balance.',
    'State store: account adds each amount to one balance record. Event store: account appends each amount as e1, e2, … to account-db.',
    'An event-store read replays the events since the latest snapshot, taking 2 ms per event. With Snapshots every 5, every 5th append also saves the running total.',
    'The account-db box shows the records. "events replayed" is how many events the latest read had to add up.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'store', label: 'Store', type: 'choice', sample: state.store, options: ['state', 'events'] },
      { name: 'operations', label: 'Operations', type: 'number', sample: state.operations, help: 'From 2 to 20, one every 20 ms.' },
      { name: 'snapshot', label: 'Snapshots', type: 'choice', sample: state.snapshot, options: [...SNAPSHOTS], help: 'Event store only.' },
    ],
    presets: [
      { label: 'State store', values: state },
      { label: 'Event store', values: events },
      { label: 'Event store, 20 operations', values: { ...events, operations: '20' } },
      { label: 'Snapshots every 5', values: { ...events, operations: '18', snapshot: 'every-5' } },
    ],
    generate: eventSourcingSteps,
    codeLabel: 'Pseudocode',
  },
  code: eventSourcingCode,
  prosCons: {
    pros: ['A complete, append-only history: an audit log for free', 'New views and reports can be built from old events at any time', 'Events are natural to publish to other services'],
    cons: ['Reading state means replaying events, so long histories need snapshots', 'Old events must stay readable as their format changes', 'Queries across many entities need read models (CQRS)'],
    useWhen: ['The history matters: money, orders, audits, compliance', 'You expect to ask new questions about past behaviour'],
    avoidWhen: ['Only the current value matters, such as a user\'s display name', 'The team has no need for history and no appetite for the extra moving parts'],
  },
  applications: [
    'Bank ledgers, where the balance is the sum of transactions',
    'Event stores such as EventStoreDB, or Kafka topics kept forever',
    'Git, which stores commits and builds any version from them',
  ],
  commonMistakes: [
    'Changing or deleting old events instead of appending a correction.',
    'Replaying the whole history on every read, with no snapshots.',
    'Naming events as commands ("Deposit") instead of facts ("Deposited").',
    'Putting derived values in events that can drift from the real history.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The balance read has reached the event store, which holds 8 events and no snapshot. What does it do?',
      view: beforeReplay.view,
      options: ['Replays all 8 events and adds them up', 'Returns the stored balance at once', 'Replays only the last event', 'Asks account for the balance'],
      answer: 0,
      explanation: 'No balance is stored. Without a snapshot, the only way to know it is to add up every event from e1.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'After 8 operations, what can the event store tell you that the state store can\'t?',
      options: ['Every deposit and withdrawal, in order', 'The current balance', 'How many requests are in flight', 'Nothing more'],
      answer: 0,
      explanation: 'The state store overwrote the balance each time. The event store kept every change.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes later reads replay fewer events?',
      code: "await events.append({ type: 'Changed', amount })\nif (events.length % 5 === 0) saveSnapshot(total())",
      options: ['if (events.length % 5 === 0) saveSnapshot(total())', "await events.append({ type: 'Changed', amount })", 'Both lines', 'Neither line'],
      answer: 0,
      explanation: 'A snapshot stores the running total, so a read starts there and replays only the events after it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A deposit of +100 was recorded by mistake. What is the event-sourcing way to fix it?',
      options: ['Append a −100 correction event', 'Delete the +100 event', 'Edit the event to +0', 'Overwrite the snapshot'],
      answer: 0,
      explanation: 'Events are never changed. A correcting event keeps the history honest: it shows the mistake and the fix.',
    },
  ],
  summary: [
    'Event sourcing stores what happened, as an append-only list of events.',
    'The current state is worked out by replaying the events.',
    'Snapshots save a running total so reads replay only recent events.',
    'Mistakes are fixed by appending corrections, so the history stays complete.',
  ],
};

export default content;
