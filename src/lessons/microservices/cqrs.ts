import { cqrsCode, cqrsSteps } from '../../microservices/scenarios/cqrs';
import type { LessonContent } from '../../types/lesson';

const single = { model: 'single', readDelay: '0', projector: '30' };
const cqrsNow = { ...single, model: 'cqrs' };

// The step where the read model has just been asked for order 42, before the projector wrote it.
const cqrsRun = cqrsSteps(cqrsNow);
const emptyRead = cqrsRun[cqrsRun.findIndex((s) => s.title.startsWith('#2 leaves the client'))]!;

const content: LessonContent = {
  overview:
    'A screen that shows an order summary needs data from orders, users and products. With one shared model, every read asks all three. CQRS (Command Query Responsibility Segregation) splits the system in two: commands change data on the write side, and queries read a separate read model that is already shaped for the screen. Reads become one fast lookup, but the read model is updated asynchronously, so a read straight after a write can see the old value.',
  concept: [
    'A command changes state ("set order 42 to paid") and returns little. A query returns data and changes nothing. CQRS gives each its own model, and often its own service and database.',
    'A projector listens to the write side\'s events and updates the read model. Here orders publishes OrderUpdated, and projector writes the new status into view-db.',
    'The read model is eventually consistent: it lags behind the write side by the time the event takes to travel and be projected. During that window, reads are stale.',
    'Read models are cheap to rebuild and can be many: one per screen or query pattern, each stored the way it is read.',
  ],
  howItWorks: [
    'The client sets order 42 to placed, paid and shipped, 150 ms apart. After each write it reads the order, Read delay later.',
    'Single model: orders answers reads itself, reading orders-db and then calling users and products.',
    'CQRS: writes go to orders, which saves the status and publishes OrderUpdated. projector takes Projector time to write it into view-db. Reads go to query, which looks it up in view-db.',
    'The request table shows the value each read returned. "stale reads" counts reads that didn\'t see the latest write sent before them.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'model', label: 'Model', type: 'choice', sample: single.model, options: ['single', 'cqrs'] },
      { name: 'readDelay', label: 'Read delay', type: 'number', sample: single.readDelay, help: 'From 0 to 140 ms after each write.' },
      { name: 'projector', label: 'Projector time', type: 'number', sample: single.projector, help: 'From 10 to 300 ms to project each event.' },
    ],
    presets: [
      { label: 'Single model', values: single },
      { label: 'CQRS, read at once', values: cqrsNow },
      { label: 'CQRS, read 80 ms later', values: { ...cqrsNow, readDelay: '80' } },
      { label: 'Slow projector', values: { ...cqrsNow, readDelay: '80', projector: '200' } },
    ],
    generate: cqrsSteps,
    codeLabel: 'Pseudocode',
  },
  code: cqrsCode,
  prosCons: {
    pros: ['Reads are one lookup, already shaped for the screen', 'Reads and writes scale separately', 'The write model stays simple and focused on rules'],
    cons: ['Reads can be stale for a while after each write', 'Two models, a projector and events to build and run', 'Bugs in the projector show wrong data until it is rebuilt'],
    useWhen: ['Reads far outnumber writes, or need data from many services', 'Screens need data in shapes the write model doesn\'t store'],
    avoidWhen: ['Simple create-read-update screens over one table', 'Users must always see their own write at once and you can\'t route them to the write side'],
  },
  applications: [
    'Order history pages built from order, payment and shipping events',
    'Search indexes (Elasticsearch) kept up to date from a database\'s events',
    'Dashboards reading pre-computed totals instead of scanning raw data',
  ],
  commonMistakes: [
    'Expecting a read straight after a write to see it.',
    'Using CQRS everywhere, even where one simple model is enough.',
    'Having no way to rebuild the read model when the projector had a bug.',
    'Letting the query side write to the write model\'s database.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'With CQRS, the client set order 42 to placed and reads it at once. What will the read return?',
      view: emptyRead.view,
      options: ['Nothing yet: the projector hasn\'t written order 42', '"placed"', 'An error', '"paid"'],
      answer: 0,
      explanation: 'The write side saved it, but the event still has to reach the projector and be written into view-db. Until then, the read model doesn\'t have it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why are CQRS reads faster here than single-model reads?',
      options: ['The read model already holds the summary, so one lookup answers it', 'The query service has more instances', 'The network is faster', 'Writes are paused during reads'],
      answer: 0,
      explanation: 'The single model joins orders, users and products on every read. The read model did that work in advance.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line keeps the read model up to date?',
      code: "on('OrderUpdated', async (event) => {\n  await viewDb.put(event.orderId, summaryOf(event))\n})",
      options: ["on('OrderUpdated', async (event) => {", 'await viewDb.put(event.orderId, summaryOf(event))', 'summaryOf(event)', 'None: the query side updates it'],
      answer: 1,
      explanation: 'The projector writes each event\'s result into view-db. That write is what the query side reads.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'When is the read model updated?',
      options: ['Shortly after the write, from its event', 'In the same transaction as the write', 'Only when the read model is rebuilt', 'When a query asks for the data'],
      answer: 0,
      explanation: 'It is updated asynchronously from events, which is why reads can be stale for a short time.',
    },
  ],
  summary: [
    'CQRS separates commands, which change data, from queries, which read it.',
    'A projector turns the write side\'s events into a read model shaped for reading.',
    'Reads get faster, but they are eventually consistent: right after a write they may be stale.',
    'Use it where reads dominate or need data from many places, not everywhere.',
  ],
};

export default content;
