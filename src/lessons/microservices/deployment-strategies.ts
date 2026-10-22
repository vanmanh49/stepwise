import { deploymentStrategiesCode, deploymentStrategiesSteps, STRATEGIES } from '../../microservices/scenarios/deployment-strategies';
import type { LessonContent } from '../../types/lesson';

const recreate = { strategy: 'recreate', v2: 'healthy', requests: '12' };
const canaryBuggy = { ...recreate, strategy: 'canary', v2: 'buggy' };

// The step where the balancer has just rolled the canary back.
const canaryRun = deploymentStrategiesSteps(canaryBuggy);
const rolledBack = canaryRun[canaryRun.findIndex((s) => s.title.startsWith('The balancer rolls back v2'))]!;

const content: LessonContent = {
  overview:
    'Shipping a new version means replacing running instances while requests keep arriving. How you replace them decides two things: whether users see downtime, and how many of them a bug in the new version can reach. This lesson deploys v2 of app four ways, with a healthy v2 and with one that fails every request, and counts the errors.',
  concept: [
    'Recreate: stop every old instance, then start the new ones. Simple, but nothing serves requests in between.',
    'Rolling: replace instances one at a time. There is no downtime, but for a while both versions serve traffic, and a bug reaches more users with each step.',
    'Blue-green: run the full new version (green) next to the old one (blue), then switch all traffic at once. Rolling back is just switching back. It needs double the capacity during the switch.',
    'Canary: send a small share of traffic to the new version and watch it. If it fails too often, stop sending it traffic automatically. Only the requests the canary served were exposed.',
  ],
  howItWorks: [
    'The client sends a request every 40 ms through the balancer to app. app-1 to app-3 run v1; app-4 to app-6 run v2. An instance that stops first leaves rotation, then finishes what it holds.',
    'Recreate stops v1 at 100 ms and starts v2 at 220 ms. Rolling swaps one instance at 100, 220 and 340 ms.',
    'Blue-green runs v2 idle from the start and switches all traffic at 200 ms. With a buggy v2, the operator switches back at 320 ms. Canary sends 25% to app-4 and rolls v2 back after 2 errors.',
    'A buggy v2 answers every request with "500: bug in v2". "served by v1/v2" counts picks per version and "errors" counts failed requests.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'strategy', label: 'Strategy', type: 'choice', sample: recreate.strategy, options: [...STRATEGIES] },
      { name: 'v2', label: 'v2', type: 'choice', sample: recreate.v2, options: ['healthy', 'buggy'], help: 'buggy: v2 fails every request.' },
      { name: 'requests', label: 'Requests', type: 'number', sample: recreate.requests, help: 'From 6 to 16, one every 40 ms.' },
    ],
    presets: [
      { label: 'Recreate', values: recreate },
      { label: 'Rolling, buggy v2', values: { ...recreate, strategy: 'rolling', v2: 'buggy' } },
      { label: 'Blue-green, buggy v2', values: { ...recreate, strategy: 'blue-green', v2: 'buggy' } },
      { label: 'Canary, buggy v2', values: canaryBuggy },
      { label: 'Rolling, healthy', values: { ...recreate, strategy: 'rolling' } },
    ],
    generate: deploymentStrategiesSteps,
    codeLabel: 'Pseudocode',
  },
  code: deploymentStrategiesCode,
  prosCons: {
    pros: ['Rolling and blue-green deploy with no downtime', 'Blue-green rolls back instantly by switching traffic back', 'A canary limits a bad release to a small share of requests'],
    cons: ['Recreate has downtime while nothing is running', 'Rolling and canary run two versions at once, so both must work with the same data', 'Blue-green needs room for two full copies of the service'],
    useWhen: ['Users must not notice a deploy', 'A bad release must reach as few users as possible'],
    avoidWhen: ['Recreate: only when a short outage is acceptable, or two versions must never run together'],
  },
  applications: [
    'Kubernetes Deployments (recreate and rolling update strategies)',
    'Argo Rollouts and Flagger for canaries with automatic rollback',
    'Load balancer target groups switched for blue-green on AWS',
  ],
  commonMistakes: [
    'Stopping instances without draining, which cuts off the requests they were working on.',
    'Shipping a database change that the old version can\'t read while both versions run.',
    'Watching a canary without an automatic rule to roll it back.',
    'Calling a deploy safe because a canary served too few requests to show the bug.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The balancer has just rolled the canary back after 2 errors. Where do the next requests go?',
      view: rolledBack.view,
      options: ['Only to the v1 instances', 'Still 25% to v2', 'Nowhere: the deploy failed', 'Only to v2, to retry'],
      answer: 0,
      explanation: 'v2\'s weight is now 0, so every request goes to v1. Only the requests the canary already served saw the bug.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With recreate and a healthy v2, why do some requests fail?',
      options: ['No instance is running between stopping v1 and starting v2', 'v2 has a bug', 'The balancer picks stopped instances', 'Requests arrive too fast'],
      answer: 0,
      explanation: 'Every v1 instance stops at 100 ms and v2 starts at 220 ms. Requests in between find nothing to serve them.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes the canary roll back by itself?',
      code: 'if (!ok && instance.version === canary) errors++\nif (errors >= maxErrors) rollback()',
      options: ['if (errors >= maxErrors) rollback()', 'if (!ok && instance.version === canary) errors++', 'Both lines are needed, but neither rolls back', 'None: an operator must roll back'],
      answer: 0,
      explanation: 'Once the canary has failed maxErrors answers, rollback() sets its weight to 0.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which strategy rolls back fastest, by switching all traffic at once?',
      options: ['Blue-green', 'Rolling', 'Recreate', 'Canary'],
      answer: 0,
      explanation: 'The old version is still running, so switching traffic back to it is immediate.',
    },
  ],
  summary: [
    'Recreate is simple but has downtime.',
    'Rolling replaces instances one by one: no downtime, but a bug spreads as it goes.',
    'Blue-green switches all traffic at once and rolls back just as fast.',
    'A canary exposes a small share of traffic and can roll back automatically.',
  ],
};

export default content;
