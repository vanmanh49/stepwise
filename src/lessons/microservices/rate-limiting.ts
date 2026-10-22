import { ALGORITHMS, rateLimitingCode, rateLimitingSteps, TRAFFIC } from '../../microservices/scenarios/rate-limiting';
import type { LessonContent } from '../../types/lesson';

const steady = { algorithm: 'fixed-window', limit: '5', per: 'all', traffic: 'steady' };
const edge = { ...steady, traffic: 'edge' };

// The step just before the first request after the 100 ms boundary is checked: the old window is full.
const edgeSteps = rateLimitingSteps(edge);
const beforeNewWindow = edgeSteps[edgeSteps.findIndex((s) => s.title.startsWith('The gateway lets #6')) - 1]!;

const content: LessonContent = {
  overview:
    'A service can only handle so much. A rate limiter at the front door counts requests and turns away the extra ones with 429 Too Many Requests, before they reach a service. How it counts matters: a fixed window can let a double burst through at its edge, and one shared limit lets a single noisy caller lock everyone else out. This lesson sends steady traffic, a burst around a window edge, and a noisy caller through a gateway with a limit.',
  concept: [
    'A fixed window counts requests per block of time: 0–99 ms, 100–199 ms, and so on. Each window allows up to the limit. It is simple, but 5 requests at the end of one window and 5 at the start of the next all pass within a few milliseconds.',
    'A token bucket holds up to the limit in tokens and refills at a steady rate (here 5 tokens per 100 ms, one every 20 ms). Each request spends a token. A burst can use the saved tokens, but then has to wait for new ones.',
    'A limit can be shared by everyone or kept per caller. With a shared limit, one busy caller uses it up and others get 429s. Per-caller limits keep each caller\'s traffic separate.',
    'Refusing early is cheap: the gateway answers 429 at once, and no service does any work for the refused request.',
  ],
  howItWorks: [
    'The client sends GET /data through the gateway to api. Each request names its caller, alice or bob.',
    'Steady traffic is 10 requests, one every 25 ms. Edge is 5 requests at 90 ms and 5 at 110 ms, around the 100 ms boundary. Noisy is bob sending 8 requests in 35 ms while alice sends 2.',
    'The gateway checks the limit 2 ms after a request arrives. Windows are 100 ms long.',
    'The badge on the gateway shows what is used in the current window, or the tokens left.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'algorithm', label: 'Algorithm', type: 'choice', sample: steady.algorithm, options: [...ALGORITHMS] },
      { name: 'limit', label: 'Limit', type: 'number', sample: steady.limit, help: 'Requests per 100 ms. From 1 to 10.' },
      { name: 'per', label: 'Limit per', type: 'choice', sample: steady.per, options: ['all', 'caller'] },
      { name: 'traffic', label: 'Traffic', type: 'choice', sample: steady.traffic, options: [...TRAFFIC] },
    ],
    presets: [
      { label: 'Steady traffic', values: steady },
      { label: 'Fixed window: burst at the edge', values: edge },
      { label: 'Token bucket at the edge', values: { ...edge, algorithm: 'token-bucket' } },
      { label: 'Noisy caller, shared limit', values: { ...steady, traffic: 'noisy' } },
      { label: 'Limit per caller', values: { ...steady, traffic: 'noisy', per: 'caller' } },
    ],
    generate: rateLimitingSteps,
    codeLabel: 'Pseudocode',
  },
  code: rateLimitingCode,
  prosCons: {
    pros: ['Protects services from more traffic than they can handle', 'Refused requests cost almost nothing', 'Per-caller limits keep one client from hurting the others'],
    cons: ['Legitimate bursts get refused', 'A fixed window can let up to twice the limit through at its edge', 'Limits across many gateway instances need shared counters'],
    useWhen: ['A public API, or any service that can be flooded', 'Callers should get a fair share'],
    avoidWhen: ['Internal calls that are already limited elsewhere: extra limits only add refusals'],
  },
  applications: [
    'Public APIs such as GitHub\'s, which return 429 with a time to retry after',
    'API gateways and load balancers such as NGINX and Envoy',
    'Login pages that slow down repeated password attempts',
  ],
  commonMistakes: [
    'Using one shared limit when a few callers send most of the traffic.',
    'Forgetting the fixed-window edge, so bursts get twice the limit.',
    'Answering with a generic 500 instead of 429, so clients do not know to slow down.',
    'Clients retrying a 429 straight away instead of backing off.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Fixed window, limit 5. The 5 requests sent at 90 ms all passed in the 0–99 ms window. #6 is checked at 117 ms. What happens?',
      view: beforeNewWindow.view,
      options: ['It passes: a new window started at 100 ms', 'It gets 429: 5 requests passed just now', 'It waits until 200 ms', 'It goes to a different service'],
      answer: 0,
      explanation: 'A fixed window only counts requests in its own block of time. At 117 ms the count starts again, so 10 requests pass within about 20 ms.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With a token bucket (limit 5, refilling 1 token every 20 ms), the same edge burst arrives. How many requests pass?',
      options: ['6: 5 saved tokens, plus 1 refilled before the second burst', '10: the window resets', '5: never more than the limit', '0: bursts are always refused'],
      answer: 0,
      explanation: 'The full bucket allows the first 5. Only 20 ms pass before the second burst, which refills 1 token, so 1 more passes and 4 get 429.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line gives alice and bob separate limits?',
      code: "const key = perCaller ? req.caller : 'everyone'\ncount[key][window] += 1\nreturn count[key][window] <= LIMIT",
      options: ["const key = perCaller ? req.caller : 'everyone'", 'count[key][window] += 1', 'return count[key][window] <= LIMIT', 'None: limits are always shared'],
      answer: 0,
      explanation: 'The key decides whose counter a request adds to. Per caller, bob\'s requests never touch alice\'s count.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why is a 429 at the gateway better than letting the service struggle?',
      options: ['The refused request costs almost nothing, and the service stays healthy for the others', 'It makes the request succeed later by itself', 'It hides the problem from the client', 'It is not: it is always worse'],
      answer: 0,
      explanation: 'The gateway turns the extra request away at once. The service only gets the traffic it can handle, and the client knows to slow down.',
    },
  ],
  summary: [
    'A rate limiter turns away extra requests with 429 before they reach a service.',
    'A fixed window is simple, but can let twice the limit through at its edge.',
    'A token bucket allows short bursts, then holds callers to a steady rate.',
    'Per-caller limits stop one noisy caller from locking out the rest.',
  ],
};

export default content;
