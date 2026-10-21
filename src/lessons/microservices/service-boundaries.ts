import { serviceBoundariesCode, serviceBoundariesSteps } from '../../microservices/scenarios/service-boundaries';
import type { LessonContent } from '../../types/lesson';

const byLayer = { split: 'by-layer', requests: '3' };

const logicToData = serviceBoundariesSteps({ split: 'by-layer', requests: '1' }).find((s) => s.title === '#1 leaves logic-1 for data-1')!;

const content: LessonContent = {
  overview:
    'Where you draw the lines between services matters more than how many services you have. Split a shop by technical layer (screens, business logic, data access) and every feature has to cross every line. Split it by business capability (orders, inventory) and most work stays inside one service. This lesson counts the calls between services for the same checkout, split both ways.',
  concept: [
    'A service boundary decides which code and data live together. Code that changes together and talks a lot should sit inside the same service, so its calls stay fast function calls instead of network hops.',
    'Splitting by layer puts the user interface, the business rules and the data access in separate services. It looks tidy, but a checkout needs all three, so one request hops ui → logic → data again and again. A change to checkout also touches all three services.',
    'Splitting by business capability gives each area of the business its own service with its own data: orders handles checkout end to end and only asks inventory to reserve stock. This idea is often called a bounded context: a part of the business with its own words, rules and data.',
    'A good boundary has few calls across it. When two services must talk on almost every request, they are probably one service split in the wrong place.',
  ],
  howItWorks: [
    'The client sends POST /checkout every 30 ms through the gateway.',
    'By layer: ui calls logic once, and logic calls data three times (read cart, read stock, write order). Each of those calls crosses a service boundary.',
    'By capability: orders does the checkout itself and calls inventory once to reserve stock.',
    'The "cross-service calls" variable counts the calls between services for the request in the current step.',
    'Compare the count and the total time of each checkout in the request table.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'split', label: 'Split', type: 'choice', sample: byLayer.split, options: ['by-layer', 'by-capability'] },
      { name: 'requests', label: 'Requests', type: 'number', sample: byLayer.requests, help: 'From 1 to 6 checkouts.' },
    ],
    presets: [
      { label: 'Split by layer', values: byLayer },
      { label: 'Split by capability', values: { split: 'by-capability', requests: '3' } },
    ],
    generate: serviceBoundariesSteps,
    codeLabel: 'Pseudocode',
  },
  code: serviceBoundariesCode,
  prosCons: {
    pros: ['Most requests stay inside one service', 'A feature change usually touches one service and one team', 'Each service owns the data its rules need'],
    cons: ['Finding the right boundaries takes knowledge of the business', 'Some data is needed by several capabilities and must be shared through APIs', 'Boundaries drawn early are costly to move later'],
    useWhen: ['Deciding how to split a system into services', 'Two services call each other on almost every request'],
    avoidWhen: ['Splitting by technical layer just because the code is organised that way'],
  },
  applications: [
    'Online shops with orders, inventory, payments and shipping services',
    'Banks separating accounts, cards and loans',
    'Planning which part of a monolith to carve out first',
  ],
  commonMistakes: [
    'Making one service per database table or per layer, so every request crosses many services.',
    'Letting two services share the same data model, which ties their changes together.',
    'Counting services instead of counting the calls between them.',
    'Drawing boundaries before understanding how the business actually works.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Split by layer, logic-1 has just sent the first of its calls to data-1 for #1. How many cross-service calls will #1 have made by the time it succeeds?',
      view: logicToData.view,
      options: ['4', '2', '1', '3'],
      answer: 0,
      explanation: 'ui calls logic once, then logic calls data three times: read cart, read stock and write order. That is 4 calls between services.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does the capability split make fewer calls between services?',
      options: ['Orders holds the checkout rules and its own data, so it only needs inventory once', 'It skips the gateway', 'Its services are on faster machines', 'It caches every answer'],
      answer: 0,
      explanation: 'Code and data that work together live together. Only reserving stock belongs to another part of the business.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'In the layer split, which line shows the chatty boundary?',
      code: 'function logicCheckout(order) {\n  const cart = data.readCart(order)\n  const stock = data.readStock(order)\n  return data.writeOrder(order)\n}',
      options: ['Every data.… line: each one is a network call to another service', 'Only the return line', 'None: these are local function calls', 'Only data.readCart'],
      answer: 0,
      explanation: 'data is a separate service, so each of the three calls crosses the network.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Two services call each other on almost every request. What does that suggest?',
      options: ['The boundary between them is probably in the wrong place', 'They need a bigger network', 'They should share a database', 'They should be split into more services'],
      answer: 0,
      explanation: 'Constant chatter means the work belongs together. Merging them, or moving the boundary, removes the hops.',
    },
  ],
  summary: [
    'A service boundary decides which code and data live together.',
    'Splitting by layer makes every feature cross every service.',
    'Splitting by business capability keeps most work inside one service.',
    'Few calls across a boundary is the sign of a good one.',
  ],
};

export default content;
