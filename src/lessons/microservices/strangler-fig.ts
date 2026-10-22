import { APPROACHES, BUGS, stranglerFigCode, stranglerFigSteps } from '../../microservices/scenarios/strangler-fig';
import type { LessonContent } from '../../types/lesson';

const nothingMoved = { approach: 'strangler', migrated: '0', bug: 'none', requests: '9' };
const buggyStrangler = { ...nothingMoved, migrated: '2', bug: 'new-orders' };

// The step where the facade has just pointed /orders back at the monolith.
const stranglerRun = stranglerFigSteps(buggyStrangler);
const routedBack = stranglerRun[stranglerRun.findIndex((s) => s.title === 'The facade now sends /orders to monolith')]!;

const content: LessonContent = {
  overview:
    'Rewriting a monolith in one go is risky: months of work, then a single switch-over where everything new is tested by real users at once. The strangler fig pattern migrates piece by piece instead. A facade sits in front of the monolith, and each path is moved to a new service when it is ready. Clients keep the same addresses, the monolith shrinks, and a path that misbehaves can be pointed back. This lesson moves paths one at a time, then compares a buggy move with a big bang.',
  concept: [
    'The facade (often the API gateway) owns the public addresses. At first it sends everything to the monolith.',
    'Each step moves one path, such as /catalog, to a new service by changing one route. Clients never notice, because the address stays the same.',
    'While both exist, the monolith is the fallback. If a moved path fails, its route goes back to the monolith while the new code is fixed.',
    'A big bang switches every path at once and retires the monolith. Every bug in the new code reaches users together, and there is nothing left to go back to.',
  ],
  howItWorks: [
    'The client sends GET /catalog, /orders and /payments in turn, one every 30 ms, always to the facade.',
    'Paths moved sends the first 0 to 3 of those paths to new services; the "/" route sends the rest to the monolith.',
    'Bug makes the new orders service fail every request. With the strangler, the team points /orders back to the monolith at 200 ms.',
    'Big bang moves all three paths and has no monolith. "monolith share" is the share of requests the monolith handled so far.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'approach', label: 'Approach', type: 'choice', sample: nothingMoved.approach, options: [...APPROACHES] },
      { name: 'migrated', label: 'Paths moved', type: 'number', sample: nothingMoved.migrated, help: 'From 0 to 3: /catalog, then /orders, then /payments. Big bang moves all.' },
      { name: 'bug', label: 'Bug', type: 'choice', sample: nothingMoved.bug, options: [...BUGS], help: 'new-orders: the new orders service fails every request.' },
      { name: 'requests', label: 'Requests', type: 'number', sample: nothingMoved.requests, help: 'From 3 to 12, one every 30 ms.' },
    ],
    presets: [
      { label: 'Nothing moved', values: nothingMoved },
      { label: 'Two paths moved', values: { ...nothingMoved, migrated: '2' } },
      { label: 'Bug in new orders, strangler', values: buggyStrangler },
      { label: 'Big bang, same bug', values: { ...nothingMoved, approach: 'big-bang', bug: 'new-orders' } },
    ],
    generate: stranglerFigSteps,
    codeLabel: 'Pseudocode',
  },
  code: stranglerFigCode,
  prosCons: {
    pros: ['Value ships early, one path at a time', 'Each move is small, and a bad one is undone by one route change', 'Clients never change their addresses'],
    cons: ['The monolith and new services run side by side for a long time', 'Moved and unmoved parts may need to share data during the migration', 'The facade becomes a critical piece that must not fail'],
    useWhen: ['A large system has to be replaced while it keeps running', 'Parts of the system can be separated by path or feature'],
    avoidWhen: ['The system is small enough to replace safely in one step', 'Requests can\'t be told apart at the edge to route them'],
  },
  applications: [
    'Moving a legacy monolith to microservices behind an API gateway',
    'Replacing an old checkout one page at a time behind a reverse proxy',
    'Migrating from an on-premises system to the cloud path by path',
  ],
  commonMistakes: [
    'Moving several paths at once, so a problem is hard to pin down.',
    'Retiring the monolith before every path has been moved and proven.',
    'Letting new services call deep into the monolith\'s database, so they can\'t be separated later.',
    'Never finishing: the last few paths stay in the monolith forever.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The facade has just pointed /orders back at the monolith. What happens to the next GET /orders?',
      view: routedBack.view,
      options: ['The monolith handles it, and it succeeds', 'It still goes to the new orders service and fails', 'The client must use a new address', 'The facade refuses it'],
      answer: 0,
      explanation: 'Only the route changed. The monolith still knows how to handle /orders, so it does.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why can\'t the big bang recover from the bug in orders the same way?',
      options: ['The monolith is gone, so there is nothing to route back to', 'The facade can\'t change routes', 'Big bang has no facade', 'The bug is in the monolith'],
      answer: 0,
      explanation: 'A big bang retires the old system. Every /orders request keeps failing until the new code is fixed.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line moves a path back to the monolith?',
      code: "const routes = {\n  '/catalog': catalog,\n  '/orders': orders,\n  '/': monolith,\n}\nroutes['/orders'] = monolith",
      options: ["routes['/orders'] = monolith", "'/': monolith,", "'/orders': orders,", 'None: clients must change'],
      answer: 0,
      explanation: 'Changing one route in the facade sends /orders to the monolith again. Nothing else changes.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Two paths have moved. What do clients need to change?',
      options: ['Nothing: they still call the facade with the same paths', 'The address for /catalog and /orders', 'Their login tokens', 'Every request'],
      answer: 0,
      explanation: 'The facade owns the addresses. Which service answers behind it is an internal detail.',
    },
  ],
  summary: [
    'A facade in front of the monolith owns every public address.',
    'Paths move to new services one at a time, and clients never notice.',
    'A failing moved path can be routed back to the monolith at once.',
    'A big bang exposes every bug at once and leaves nothing to fall back to.',
  ],
};

export default content;
