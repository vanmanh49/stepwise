import { API_GATEWAY_PATHS, apiGatewayCode, apiGatewaySteps } from '../../microservices/scenarios/api-gateway';
import type { LessonContent } from '../../types/lesson';

const route = { path: '/orders/42', token: 'yes', auth: 'required' };
const noToken = { path: '/orders/42', token: 'no', auth: 'required' };

const atGateway = apiGatewaySteps(noToken).find((s) => s.title === 'GET /orders/42 #1 reaches the gateway')!;

const content: LessonContent = {
  overview:
    'An API gateway is the single front door of a microservice system. Clients send every request to it, and it decides which service should answer. On the way it can handle jobs every service would otherwise repeat, such as checking that the caller is logged in. This lesson sends requests with and without a token, and to a path no service owns.',
  concept: [
    'Without a gateway, clients must know the address of every service and call each one directly. Every change to the services then breaks the clients.',
    'With a gateway, clients know one address. The gateway keeps a routing table that maps path prefixes to services: /orders goes to the orders service, /users to the users service. When several prefixes match, the longest one wins.',
    'Cross-cutting jobs move to the gateway: checking tokens, rate limits, logging. A request without a valid token is turned away with 401 before any service spends time on it.',
    'A path that matches no route gets 404 from the gateway itself. The cost of a gateway is one extra hop for every request, and it must stay fast and available, because everything goes through it.',
  ],
  howItWorks: [
    'The client sends one request to the gateway.',
    'If auth is required and the request has no token, the gateway answers 401 straight away.',
    'Otherwise the gateway looks for the longest route prefix that the path starts with.',
    'With no matching route, it answers 404. With a match, it forwards the request to that service and passes the answer back.',
    'Watch the path taken in the request table: rejected requests never reach a service.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'path', label: 'Path', type: 'choice', sample: route.path, options: API_GATEWAY_PATHS },
      { name: 'token', label: 'Token', type: 'choice', sample: route.token, options: ['yes', 'no'], help: 'Whether the request carries a login token.' },
      { name: 'auth', label: 'Auth', type: 'choice', sample: route.auth, options: ['required', 'off'], help: 'Whether the gateway checks tokens.' },
    ],
    presets: [
      { label: 'Route by path', values: route },
      { label: 'No token', values: noToken },
      { label: 'Unknown path', values: { path: '/payments/1', token: 'yes', auth: 'required' } },
    ],
    generate: apiGatewaySteps,
    codeLabel: 'Pseudocode',
  },
  code: apiGatewayCode,
  prosCons: {
    pros: ['Clients need only one address', 'Auth and other shared checks live in one place', 'Bad requests are stopped before they reach a service'],
    cons: ['One extra hop on every request', 'It must be highly available, since everything passes through it', 'Too much business logic in the gateway makes it a new monolith'],
    useWhen: ['Many services sit behind one public API', 'Several services need the same checks'],
    avoidWhen: ['There is only one service', 'You are tempted to put business rules in the routing layer'],
  },
  applications: [
    'Mobile and web apps calling one public API',
    'Checking login tokens before requests reach internal services',
    'Routing /v1 and /v2 paths to old and new versions of a service',
  ],
  commonMistakes: [
    'Putting business rules in the gateway, so it has to change with every feature.',
    'Running a single gateway instance, so one crash takes the whole system offline.',
    'Letting services skip their own checks entirely because "the gateway does it".',
    'Writing overlapping routes and forgetting that the longest matching prefix wins.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'GET /orders/42 has just reached the gateway without a token, and auth is required. What happens next?',
      view: atGateway.view,
      options: ['The gateway answers 401 and the orders service never sees it', 'The orders service answers 401', 'The gateway forwards it and orders asks for a token', 'The gateway answers 404'],
      answer: 0,
      explanation: 'Checking tokens is the gateway\'s job, so the request is rejected at the door.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'The routes are /orders → orders and /orders/archive → archive. Where does /orders/archive/9 go?',
      options: ['archive: the longest matching prefix wins', 'orders: the first route wins', 'Both services', 'Nowhere: it gets 404'],
      answer: 0,
      explanation: 'Both prefixes match, and the gateway picks the most specific one.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line answers a request for /payments/1, with these routes for /orders and /users?',
      code: 'const target = routes.match(req.path)\nif (!target) {\n  return 404\n}\nreturn forward(target, req)',
      options: ['return 404', 'return forward(target, req)', 'const target = routes.match(req.path)', 'None: the request waits'],
      answer: 0,
      explanation: 'No route matches /payments, so target is empty and the gateway answers 404 itself.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does a gateway cost every request?',
      options: ['One extra network hop and a little processing time', 'A full database query', 'A second login', 'Nothing at all'],
      answer: 0,
      explanation: 'Every request passes through the gateway first, which adds a hop. That is why it must stay simple and fast.',
    },
  ],
  summary: [
    'An API gateway is the single entry point that routes each request to the service that owns its path.',
    'The longest matching route prefix wins; no match means 404 from the gateway.',
    'Shared checks such as tokens happen once, at the gateway, before any service does work.',
    'The price is one extra hop and a component that must never go down.',
  ],
};

export default content;
