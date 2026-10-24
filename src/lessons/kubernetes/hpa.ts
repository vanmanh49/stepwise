import { CURVES, hpaCode, hpaSteps, TARGETS } from '../../kubernetes/scenarios/hpa';
import type { LessonContent } from '../../types/lesson';

const spike = { curve: 'spike', max: '8', target: '50' };

// The spike has just arrived: 2 pods are far above the 50% target.
const steps = hpaSteps(spike);
const beforeUp = steps[steps.findIndex((s) => s.title.startsWith('HPA web')) - 1]!;

const content: LessonContent = {
  overview:
    'A Horizontal Pod Autoscaler (HPA) changes how many pods a Deployment runs, based on how busy they are. This lesson sends a traffic spike, a ramp or flapping load to a Deployment with an HPA and watches the replica count follow: up quickly, down slowly.',
  concept: [
    'The HPA compares the pods\' average CPU use with their CPU request. Its target is a percentage of the request, for example 50%.',
    'Desired replicas = ready pods × (usage ÷ target), rounded up and kept between min and max. Within 10% of the target it does nothing, so small wobbles don\'t cause changes.',
    'Scaling up doesn\'t wait, but it is rate-limited: by default one step adds at most 4 pods or doubles them, whichever is more. Scaling down waits: the HPA uses the highest recommendation of a stabilisation window (30 s here, 5 minutes by default), so a brief dip doesn\'t remove pods.',
    'The HPA needs CPU requests on the pods (usage is a share of the request) and metrics about their use. More pods share the load, so each pod\'s use drops and the HPA settles.',
  ],
  howItWorks: [
    'A Deployment named web starts with 2 pods, each requesting 100m of CPU. An HPA keeps it between 2 and your max replicas.',
    'Traffic follows the curve you pick. Each request costs 10m of CPU, shared by the ready pods.',
    'Metrics are read and the HPA syncs every 5 s here (about 15 s in Kubernetes).',
    'Watch the HPA row: CPU use against the target, and the replicas it asks for.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'curve', label: 'Traffic', type: 'choice', sample: spike.curve, options: CURVES, help: 'spike: 10 → 40 req/s from 30 s to 70 s; ramp: 10 → 60 req/s; flapping: 10 and 40 req/s every 10 s.' },
      { name: 'max', label: 'Max replicas', type: 'number', sample: spike.max, help: 'From 4 to 8.' },
      { name: 'target', label: 'Target CPU (% of request)', type: 'choice', sample: spike.target, options: TARGETS },
    ],
    presets: [
      { label: 'A spike scales up, then down', values: spike },
      { label: 'Hits max replicas', values: { ...spike, max: '4' } },
      { label: 'Flapping load is smoothed', values: { ...spike, curve: 'flapping' } },
    ],
    generate: hpaSteps,
    codeLabel: 'Pseudocode',
  },
  code: hpaCode,
  prosCons: {
    pros: ['Capacity follows demand without anyone watching', 'Fast scale-up for spikes, careful scale-down', 'Saves money when traffic is low'],
    cons: ['Reacts after the load arrives: metrics and new pods take time', 'Needs good CPU requests, or the percentages mean little', 'Can\'t add pods beyond what the nodes can hold (that is the Cluster Autoscaler\'s job)'],
    useWhen: ['Stateless services whose load changes during the day'],
    avoidWhen: ['Load you can predict exactly: scale on a schedule', 'Work limited by something other than CPU, unless you use custom metrics'],
  },
  applications: [
    'kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=10 creates an HPA',
    'kubectl get hpa shows current and target CPU and the replica count',
    'Custom and external metrics (queue length, requests per second) drive the same loop',
  ],
  commonMistakes: [
    'Pods without CPU requests: the HPA can\'t compute a percentage and does nothing.',
    'Setting max too low, so the HPA is stuck at max while pods are overloaded.',
    'Expecting instant scale-down: the stabilisation window keeps pods for a while on purpose.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Two pods each use 200m of CPU against a 100m request; the target is 50%. How many replicas does the HPA ask for?',
      view: beforeUp.view,
      options: ['6: it wants 8, but one step adds at most 4 pods (or doubles them)', '8: 2 × (200% ÷ 50%), all at once', '3: one more each sync', '2: it waits for the window'],
      answer: 0,
      explanation: 'Usage is 200% of the request, four times the target, so it wants 2 × 4 = 8. Scale-up doesn\'t wait, but the default policy adds at most max(4 pods, 100%) per step: 2 + 4 = 6 now, 8 on the next sync.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Load drops sharply. When does the HPA remove pods?',
      options: ['After every recommendation in the stabilisation window agrees on fewer pods', 'At the very next sync', 'Never: HPAs only scale up', 'Only when someone deletes them'],
      answer: 0,
      explanation: 'Scale-down uses the highest recommendation of the window (30 s here, 5 minutes by default).',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops tiny changes in usage from changing the replica count?',
      code: 'if (Math.abs(ratio - 1) <= 0.1) return\nlet desired = clamp(ceil(readyPods * ratio), min, max)',
      options: ['The tolerance check: within 10% of the target, do nothing', 'The clamp', 'ceil()', 'None of them'],
      answer: 0,
      explanation: 'A ratio between 0.9 and 1.1 counts as on target.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why must pods have CPU requests for this HPA?',
      options: ['Its target is a percentage of the request', 'The scheduler needs them to start the HPA', 'Requests make pods faster', 'They don\'t need them'],
      answer: 0,
      explanation: 'Without a request there is nothing to take a percentage of, so the HPA reports "missing request for cpu".',
    },
  ],
  summary: [
    'The HPA sets replicas from average CPU use against a target share of the request.',
    'desired = ready pods × usage ÷ target, within min and max, with a 10% tolerance.',
    'It scales up without waiting (at most +4 pods or double per step) and down only after a stabilisation window.',
    'It needs CPU requests and metrics; nodes must have room for the new pods.',
  ],
};

export default content;
