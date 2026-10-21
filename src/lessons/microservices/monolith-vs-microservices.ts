import { monolithVsMicroservicesCode, monolithVsMicroservicesSteps } from '../../microservices/scenarios/monolith-vs-microservices';
import type { LessonContent } from '../../types/lesson';

const monolith = { architecture: 'monolith', bug: 'off', requests: '4' };
const monolithBug = { architecture: 'monolith', bug: 'on', requests: '4' };

const beforeThird = monolithVsMicroservicesSteps(monolithBug).find((s) => s.title === '#3 leaves the client for app-1')!;

const content: LessonContent = {
  overview:
    'A monolith is one program that does everything: products, reviews, checkout, all in one process with one database. Microservices split the same work into small services that each run on their own and talk over the network. This lesson runs the same requests both ways, so you can see what the split costs and what it buys.',
  concept: [
    'In a monolith, a request is handled by a function call inside one process. Calls are fast and nothing travels over a network. But every part shares the same process: if one part crashes, all of it stops.',
    'In a microservice system, each business area (products, reviews) is its own service with its own database. A gateway in front sends each request to the service that owns its path. Every hop between services crosses the network, so each request takes a little longer.',
    'The payoff is isolation. A bug in reviews crashes only the reviews service; products keeps answering. Teams can also change and deploy their own service without touching the others.',
    'Neither is better in general. A monolith is simpler and faster while the system is small. Microservices start to pay off when many teams work on one product and parts need to fail, scale or change on their own.',
  ],
  howItWorks: [
    'The client sends GET /products and GET /reviews in turn, one every 50 ms.',
    'Monolith: the app process handles the request, queries its database and replies.',
    'Microservices: the gateway reads the path and forwards the request to products or reviews; that service queries its own database and replies through the gateway.',
    'With the reviews bug on, handling a /reviews request crashes the process that runs it.',
    'Compare the time column and the failures in the request table for both architectures.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'architecture', label: 'Architecture', type: 'choice', sample: monolith.architecture, options: ['monolith', 'microservices'] },
      { name: 'bug', label: 'Reviews bug', type: 'choice', sample: monolith.bug, options: ['off', 'on'], help: 'On: handling a /reviews request crashes its process.' },
      { name: 'requests', label: 'Requests', type: 'number', sample: monolith.requests, help: 'From 1 to 8, alternating /products and /reviews.' },
    ],
    presets: [
      { label: 'Monolith', values: monolith },
      { label: 'Microservices', values: { architecture: 'microservices', bug: 'off', requests: '4' } },
      { label: 'Monolith with a reviews bug', values: monolithBug },
      { label: 'Microservices with a reviews bug', values: { architecture: 'microservices', bug: 'on', requests: '4' } },
    ],
    generate: monolithVsMicroservicesSteps,
    codeLabel: 'Pseudocode',
  },
  code: monolithVsMicroservicesCode,
  prosCons: {
    pros: ['A failure stays inside one service', 'Teams deploy their own service on their own schedule', 'Each service can scale separately'],
    cons: ['Every hop adds network time', 'More moving parts to run and monitor', 'Data is spread over several databases'],
    useWhen: ['Several teams work on one product', 'Parts of the system need to scale or fail independently'],
    avoidWhen: ['The product and team are small', 'You are not sure yet where the boundaries between parts are'],
  },
  applications: [
    'Large online shops that split catalogue, cart, payments and reviews',
    'Streaming services that run recommendations apart from playback',
    'Companies breaking up an old monolith one piece at a time',
  ],
  commonMistakes: [
    'Splitting into microservices on day one, before the boundaries are clear.',
    'Forgetting that every service call is a network call that can be slow or fail.',
    'Sharing one database between services, which brings back the coupling the split was meant to remove.',
    'Assuming a split system is automatically more reliable: it is only isolated if one failure cannot spread.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The monolith crashed while handling #2 GET /reviews. #3 GET /products is now on its way to app. What happens to it?',
      view: beforeThird.view,
      options: ['It fails: app-1 has stopped and refuses the connection', 'It succeeds, because the bug is only in reviews', 'It waits until app restarts', 'The gateway sends it to another service'],
      answer: 0,
      explanation: 'Products and reviews run in the same process. Once that process crashes, every request to it is refused, including /products.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does GET /products take longer in the microservice version?',
      options: ['It crosses more network hops: client → gateway → products → its database', 'The products service is written in a slower language', 'The gateway retries every request', 'Microservices always process requests one at a time'],
      answer: 0,
      explanation: 'Each hop between separate processes travels over the network, and the gateway adds its own small processing time.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'In the monolith pseudocode, why does crash() stop /products requests too?',
      code: 'function handle(req) {\n  if (req.path.startsWith("/reviews") && bug) {\n    crash()\n  }\n  ...\n}',
      options: ['One process runs the code for every path, so crashing it stops all of them', 'crash() deletes the products table', 'crash() only stops /reviews', 'The gateway blocks /products after a crash'],
      answer: 0,
      explanation: 'The same handle function serves every path. When its process dies, nothing is left to answer any request.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'When is a monolith usually the better choice?',
      options: ['A small team building a new product whose parts are still changing', 'Twenty teams each owning a part of a large shop', 'A system where payments must keep working when reviews fail', 'A product where one part needs a hundred times more servers than the rest'],
      answer: 0,
      explanation: 'A monolith is simpler to build, test and run. The costs of a split only pay off once teams and parts need to move independently.',
    },
  ],
  summary: [
    'A monolith runs everything in one process; microservices run each business area as its own service.',
    'Microservices pay for isolation with network hops: each request takes a little longer.',
    'A crash in a monolith stops every path; in a split system it stops only the failing service.',
    'Start simple, and split when teams and failure isolation make it worth the cost.',
  ],
};

export default content;
