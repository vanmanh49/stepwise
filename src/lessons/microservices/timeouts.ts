import { timeoutsCode, timeoutsSteps } from '../../microservices/scenarios/timeouts';
import type { LessonContent } from '../../types/lesson';

const none = { inventory: '600', apiTimeout: '0', clientTimeout: '0', requests: '2' };
const apiTimeout = { ...none, apiTimeout: '200' };

// The step just before api gives up: inventory is still working and nothing has failed yet.
const timeoutSteps = timeoutsSteps(apiTimeout);
const givesUp = timeoutSteps.findIndex((s) => s.title.startsWith('api gives up'));
const beforeGiveUp = timeoutSteps[givesUp - 1]!;

const content: LessonContent = {
  overview:
    'When one service calls another, it waits for the answer. If the other service is slow, the caller waits too, and so does everyone waiting on the caller. A timeout is a promise to stop waiting after a set time. This lesson calls a slow inventory service with no timeout, with a sensible timeout, with one that is too short, and with a client that gives up before the service behind it does.',
  concept: [
    'Without a timeout, a caller waits as long as the slowest service takes. A slow dependency makes every request slow, and the caller keeps its connection and memory busy the whole time.',
    'A timeout turns "slow" into "failed, fast". The caller gets its answer (an error) after a known time and can move on: show a message, try something else, or retry later.',
    'A timeout does not stop the other service. Inventory keeps working and still sends its answer. That answer arrives too late and is thrown away: the work was wasted.',
    'Timeouts along a chain should get shorter as you go deeper. If the client gives up before the API does, the API keeps waiting for an answer nobody will read.',
  ],
  howItWorks: [
    'The client sends GET /stock to api, one request every 100 ms. api calls inventory for every request.',
    'Every link takes 5 ms. api works for 10 ms, and inventory takes the time you set.',
    'API timeout is how long api waits for inventory. Client timeout is how long the client waits for api. 0 means it waits forever.',
    'When a timeout fires, the caller fails the request at once. The late answer still arrives later and is shown as wasted.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'inventory', label: 'Inventory time (ms)', type: 'number', sample: none.inventory, help: 'From 10 to 1000.' },
      { name: 'apiTimeout', label: 'API timeout (ms)', type: 'number', sample: none.apiTimeout, help: '0 means no timeout. Up to 2000.' },
      { name: 'clientTimeout', label: 'Client timeout (ms)', type: 'number', sample: none.clientTimeout, help: '0 means no timeout. Up to 2000.' },
      { name: 'requests', label: 'Requests', type: 'number', sample: none.requests, help: 'From 1 to 4, one every 100 ms.' },
    ],
    presets: [
      { label: 'No timeouts', values: none },
      { label: 'API timeout 200 ms', values: apiTimeout },
      { label: 'Timeout too short', values: { ...none, inventory: '20', apiTimeout: '25' } },
      { label: 'Client gives up first', values: { ...none, apiTimeout: '400', clientTimeout: '150' } },
    ],
    generate: timeoutsSteps,
    codeLabel: 'Pseudocode',
  },
  code: timeoutsCode,
  prosCons: {
    pros: ['A slow service can no longer make its callers wait forever', 'Failures arrive after a known time, so callers can react', 'Connections and memory are freed instead of piling up'],
    cons: ['The slow service still does the work, and its answer is wasted', 'Too short a timeout fails requests that would have succeeded', 'A timed-out request may still have taken effect on the other side'],
    useWhen: ['Every call over the network', 'A caller has its own deadline to meet'],
    avoidWhen: ['Never skip it on a network call; only choose the length with care'],
  },
  applications: [
    'HTTP clients and gRPC deadlines between services',
    'Database query timeouts, so one slow query cannot hold a connection forever',
    'A page that shows "try again later" instead of spinning for a minute',
  ],
  commonMistakes: [
    'Leaving the library default, which is often no timeout at all.',
    'Setting the timeout below the time a healthy call needs, so it always fails.',
    'Giving the outer caller a shorter timeout than the services behind it.',
    'Assuming a timed-out request did nothing: the other side may have finished it.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'api called inventory with a 200 ms timeout at 15 ms. Inventory needs 600 ms. What happens at 215 ms?',
      view: beforeGiveUp.view,
      options: ['api gives up on inventory and fails the request', 'Inventory stops working on the request', 'The client gets the stock answer', 'api sends the request again'],
      answer: 0,
      explanation: 'At 215 ms api has waited 200 ms, so it stops waiting and replies with a failure. Inventory knows nothing about it and keeps working.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Inventory answers in 20 ms, and a call there and back takes 30 ms in total. The API timeout is 25 ms. What happens?',
      options: ['Every call fails, though inventory is healthy', 'Every call succeeds, because inventory is fast', 'Only the first call fails', 'The timeout grows by itself until calls succeed'],
      answer: 0,
      explanation: 'The answer always needs 30 ms to come back, so a 25 ms timeout fires first every time. A timeout must leave room for the normal round trip.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes the caller stop waiting?',
      code: "const timer = setTimeout(() => reject('timed out'), ms)\nsend(service, req).then((answer) => {\n  clearTimeout(timer)\n  resolve(answer)\n})",
      options: ["setTimeout(() => reject('timed out'), ms)", 'clearTimeout(timer): it cancels the timer', 'resolve(answer)', 'send(service, req): it sends the request out'],
      answer: 0,
      explanation: 'After ms milliseconds the timer rejects the promise, so the caller moves on even though no answer has come.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'The client gives up after 150 ms, but api waits 400 ms for inventory. What goes wrong?',
      options: ['api and inventory keep working on a request nobody is waiting for', 'The client gets the answer twice', 'Inventory fails faster', 'Nothing: the timeouts do not affect each other'],
      answer: 0,
      explanation: 'Once the client has failed the request, everything api and inventory still do for it is wasted. Inner timeouts should be shorter than outer ones.',
    },
  ],
  summary: [
    'Without a timeout, a caller waits as long as the slowest service behind it.',
    'A timeout turns a slow call into a fast failure the caller can handle.',
    'The other service keeps working, and its late answer is wasted.',
    'Pick timeouts longer than a healthy round trip, and shorter as you go deeper in a chain.',
  ],
};

export default content;
