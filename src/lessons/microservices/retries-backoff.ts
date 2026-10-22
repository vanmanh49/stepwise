import { BACKOFFS, retriesBackoffCode, retriesBackoffSteps } from '../../microservices/scenarios/retries-backoff';
import type { LessonContent } from '../../types/lesson';

const noRetries = { retries: '0', backoff: 'none', jitter: 'off', outage: '200', requests: '6' };
const immediate = { ...noRetries, retries: '3' };

// The step just before #1's first retry: it was refused, and nothing says yet what the client will do.
const immediateSteps = retriesBackoffSteps(immediate);
const beforeRetry = immediateSteps[immediateSteps.findIndex((s) => s.title.startsWith('#1 tries again')) - 1]!;

const content: LessonContent = {
  overview:
    'Many failures are short: a service restarts, a network blip passes. Trying again often works. But how you try again matters. This lesson sends 6 requests to a service that refuses connections for its first 200 ms, then retries them straight away, after a fixed wait, after a growing wait, and after a growing wait with a random part.',
  concept: [
    'A retry sends the same request again after a failure. It turns a short outage into a slower success instead of an error.',
    'Retrying straight away rarely helps: the service is still down, and every retry is one more call it has to refuse. Many callers retrying at once is a retry storm.',
    'Backoff waits before each retry. Exponential backoff doubles the wait each time (50, 100, 200 ms), so the retries reach further and further past the outage.',
    'If every caller waits exactly the same time, they all come back in the same instant and hit the service together. Jitter adds a random part to each wait, so the callers spread out.',
  ],
  howItWorks: [
    'The client sends 6 GET /price at 0 ms. api refuses every connection until the outage ends.',
    'A refused call comes back as a failure after 10 ms (5 ms there, 5 ms back).',
    'Retries is how many times each request may try again. Backoff picks the wait: none, a fixed 50 ms, or 50 ms doubling each time.',
    'Jitter keeps half of each wait and makes the other half random. The random numbers come from a fixed seed, so the run is the same every time.',
    'Watch "calls to api" (every call it received) and "busiest 10 ms of retries" (how many retries arrived together at worst).',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'retries', label: 'Retries', type: 'number', sample: noRetries.retries, help: 'From 0 to 4 per request.' },
      { name: 'backoff', label: 'Backoff', type: 'choice', sample: noRetries.backoff, options: [...BACKOFFS] },
      { name: 'jitter', label: 'Jitter', type: 'choice', sample: noRetries.jitter, options: ['off', 'on'] },
      { name: 'outage', label: 'Outage (ms)', type: 'number', sample: noRetries.outage, help: 'api refuses connections from 0 ms until this time. Up to 500.' },
      { name: 'requests', label: 'Requests', type: 'number', sample: noRetries.requests, help: 'From 1 to 8, all sent at 0 ms.' },
    ],
    presets: [
      { label: 'No retries', values: noRetries },
      { label: 'Immediate retries', values: immediate },
      { label: 'Fixed backoff', values: { ...immediate, backoff: 'fixed' } },
      { label: 'Exponential backoff', values: { ...immediate, backoff: 'exponential' } },
      { label: 'Exponential backoff with jitter', values: { ...immediate, backoff: 'exponential', jitter: 'on' } },
    ],
    generate: retriesBackoffSteps,
    codeLabel: 'Pseudocode',
  },
  code: retriesBackoffCode,
  prosCons: {
    pros: ['Short outages turn into slower successes instead of errors', 'Backoff gives a struggling service time to recover', 'Jitter stops callers from returning all at once'],
    cons: ['Every retry is extra load on a service that is already failing', 'Retries make a request slower before it finally fails', 'Retrying a request that changes something can do it twice'],
    useWhen: ['Failures are likely to be short: restarts, blips, brief overload', 'The request is safe to repeat, or carries an idempotency key'],
    avoidWhen: ['The error will not go away by itself, such as 400 Bad Request', 'Many layers already retry: the retries multiply'],
  },
  applications: [
    'AWS and Google Cloud SDKs, which retry with exponential backoff and jitter',
    'HTTP clients and service meshes that retry failed calls between services',
    'Phones reconnecting to a server after the network comes back',
  ],
  commonMistakes: [
    'Retrying straight away in a tight loop, adding load exactly when the service is down.',
    'Using the same fixed wait for every caller, so they all return together.',
    'Retrying without a limit, so a request never finishes.',
    'Retrying at every layer of a call chain: 3 retries at 3 layers is up to 64 calls.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'api refused #1. Retries are on, with no backoff. What does the client do next?',
      view: beforeRetry.view,
      options: ['Sends #1 again at once', 'Waits 50 ms, then sends #1 again', 'Gives up on #1 for good', 'Sends #1 to a different service'],
      answer: 0,
      explanation: 'With no backoff the client retries straight away. api is still down, so the retry is refused too.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: '6 requests each retry 3 times with no backoff during a 200 ms outage. How many calls does api receive?',
      options: ['24, and every one is refused', '6, because retries go somewhere else', '18, because the first tries do not count', '3, one per retry'],
      answer: 0,
      explanation: 'Each request makes 1 try plus 3 retries, all within 40 ms, so 6 × 4 = 24 calls arrive while api is still down.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line spreads callers that failed at the same moment?',
      code: 'function backoff(n) {\n  const delay = BASE_MS * 2 ** (n - 1)\n  return delay / 2 + random() * delay / 2\n}',
      options: ['return delay / 2 + random() * delay / 2', 'const delay = BASE_MS * 2 ** (n - 1)', 'function backoff(n) {', 'None: every caller waits the same'],
      answer: 0,
      explanation: 'The random part makes each caller wait a different time, so they no longer come back together.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With exponential backoff and no jitter, all 6 requests succeed at 400 ms. What problem is left?',
      options: ['All 6 retries arrive in the same millisecond', 'None of them succeed', 'They are slower than with no retries', 'The outage gets longer'],
      answer: 0,
      explanation: 'Every caller waits exactly 50, 100 and 200 ms, so their retries land together. With many callers, that burst can knock the service over again.',
    },
  ],
  summary: [
    'Retries turn short outages into slower successes.',
    'Immediate retries pile extra calls onto a service that is down.',
    'Exponential backoff waits longer each time, reaching past the outage.',
    'Jitter spreads callers out so they do not all return at once.',
  ],
};

export default content;
