import { CORDON, schedulerCode, schedulerSteps, STRATEGIES } from '../../kubernetes/scenarios/scheduler';
import type { LessonContent } from '../../types/lesson';

const spread = { strategy: 'LeastAllocated', cpu: '1', cordon: 'off' };

// The pod exists and waits for a node; the three nodes are 2, 4 and 3 CPU.
const steps = schedulerSteps(spread);
const beforeBind = steps[steps.findIndex((s) => s.title.startsWith('scheduler binds')) - 1]!;

const content: LessonContent = {
  overview:
    'The scheduler decides which node each new pod runs on. It works in two passes: first it rules out every node that can\'t take the pod, then it scores the rest and picks the best. This lesson places one pod on three nodes of different sizes and shows the scheduler\'s table: why each node was ruled out, or how it scored.',
  concept: [
    'Filtering removes nodes that can\'t run the pod: a cordoned node, a node with a taint the pod doesn\'t tolerate, a node that doesn\'t match the pod\'s required affinity, or a node without enough free CPU or memory for the pod\'s requests.',
    'Scoring ranks the nodes that are left. Each plugin gives 0 to 100 and the scores are added up. The resource plugin can spread pods out (LeastAllocated, the default) or pack them together (MostAllocated).',
    'Requests, not actual use, decide whether a pod fits: a node is "full" when the requests of its pods add up to its capacity, even if they use far less.',
    'If no node passes the filters, the pod stays Pending and the scheduler explains why, counting each reason: "0/3 nodes are available: 1 node(s) were unschedulable, 2 Insufficient cpu".',
  ],
  howItWorks: [
    'Three nodes: node-1 has 2 CPU, node-2 has 4 and node-3 has 3. Each has 4 GiB of memory.',
    'kubectl creates one pod that requests the CPU you choose and 1 GiB of memory.',
    'The scheduler filters the nodes, then scores those left with the strategy you pick. The table shows every node\'s result.',
    'With node-2 cordoned and a 4-CPU pod, no node passes and the pod stays Pending.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'strategy', label: 'Scoring strategy', type: 'choice', sample: spread.strategy, options: STRATEGIES },
      { name: 'cpu', label: 'Pod CPU request', type: 'number', sample: spread.cpu, help: 'From 1 to 4 cores.' },
      { name: 'cordon', label: 'Cordon node-2', type: 'choice', sample: spread.cordon, options: CORDON },
    ],
    presets: [
      { label: 'Spread (least allocated)', values: spread },
      { label: 'Bin-pack (most allocated)', values: { ...spread, strategy: 'MostAllocated' } },
      { label: 'Nothing fits', values: { ...spread, cpu: '4', cordon: 'on' } },
    ],
    generate: schedulerSteps,
    codeLabel: 'Pseudocode',
  },
  code: schedulerCode,
  prosCons: {
    pros: ['Pods only land where they can actually run', 'Clear, countable reasons when a pod can\'t be placed', 'Scoring is pluggable: spread for resilience, pack for cost'],
    cons: ['Decisions use requests, so pods without requests can overload a node', 'The scheduler places each pod once; it doesn\'t move pods later when the cluster changes', 'Many filters and scores can make a placement hard to predict'],
    useWhen: ['Always: every pod goes through the scheduler unless it names a node itself'],
    avoidWhen: ['You need pods moved after placement: that takes extra tools such as the descheduler'],
  },
  applications: [
    'kubectl describe pod shows the "0/N nodes are available" message under Events',
    'Cost-saving clusters switch the scoring to MostAllocated so the autoscaler can remove empty nodes',
    'Large clusters tune scoring plugins and weights in a scheduler profile',
  ],
  commonMistakes: [
    'Leaving out resource requests: the scheduler then thinks the pod needs nothing and may crowd a node.',
    'Expecting the scheduler to look at real CPU use: it only adds up requests.',
    'Reading "Insufficient cpu" as the cluster being busy, when one big request is simply bigger than any single node.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The pod requests 1 CPU. node-1 has 2 CPU, node-2 has 4, node-3 has 3, all empty. With LeastAllocated, where does it go?',
      view: beforeBind.view,
      options: ['node-2: it keeps the most room (3 of 4 CPU free)', 'node-1: it is the first node', 'node-3: it is in the middle', 'Nowhere: the pod is too big'],
      answer: 0,
      explanation: 'LeastAllocated scores the free share left after placing the pod: 1/2 on node-1, 3/4 on node-2, 2/3 on node-3. node-2 scores highest.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What decides whether a pod "fits" a node?',
      options: ['The pod\'s requests against the node\'s capacity minus other pods\' requests', 'The node\'s current CPU use', 'The number of pods on the node', 'The node\'s name'],
      answer: 0,
      explanation: 'The scheduler adds up requests. Actual use doesn\'t matter for placement.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes MostAllocated pack pods together?',
      code: "const score = (node) => strategy === 'LeastAllocated'\n  ? freeAfter(node, pod)\n  : 100 - freeAfter(node, pod)",
      options: ['100 - freeAfter(node, pod): fuller nodes score higher', 'freeAfter(node, pod)', 'The strategy check itself', 'None: both strategies score the same'],
      answer: 0,
      explanation: 'Subtracting the free share from 100 turns "most room left" into "least room left", so the fullest feasible node wins.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A pod shows "0/3 nodes are available: 1 node(s) were unschedulable, 2 Insufficient cpu". What does it mean?',
      options: ['One node is cordoned and the other two don\'t have enough free CPU for the request', 'The cluster has 3 CPU in total', 'The pod is waiting for its image', 'Two nodes are down'],
      answer: 0,
      explanation: 'The scheduler counts why each node was ruled out: one is cordoned (unschedulable), two lack CPU for the request.',
    },
  ],
  summary: [
    'The scheduler filters nodes, then scores the rest and binds the pod to the best.',
    'Filters check cordons, taints, required affinity and free CPU and memory (by requests).',
    'LeastAllocated spreads pods out; MostAllocated packs them together.',
    'With no feasible node, the pod stays Pending with a counted list of reasons.',
  ],
};

export default content;
