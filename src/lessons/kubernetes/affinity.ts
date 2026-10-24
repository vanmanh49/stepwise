import { affinityCode, affinitySteps, ANTI, NODE_AFFINITY } from '../../kubernetes/scenarios/affinity';
import type { LessonContent } from '../../types/lesson';

const ssd = { node: 'required ssd', anti: 'none', replicas: '3' };
const tooMany = { node: 'none', anti: 'required', replicas: '6' };

// Four web pods are placed, one per node; two more are still to place with required anti-affinity.
const steps = affinitySteps(tooMany);
const allFull = steps[steps.findIndex((s) => s.title.startsWith("scheduler can't place")) - 1]!;

const content: LessonContent = {
  overview:
    'Affinity lets a pod say where it wants to run. Node affinity picks nodes by their labels; pod anti-affinity keeps a pod away from others like it, so replicas don\'t all share one node. This lesson places web pods on four nodes in two zones, labelled ssd or hdd.',
  concept: [
    'Node affinity matches node labels. Required (requiredDuringSchedulingIgnoredDuringExecution) is a filter: no matching node, no placement. Preferred is a score: matching nodes get extra points, but others still qualify.',
    'Pod anti-affinity matches other pods by label within a topology: the same node (kubernetes.io/hostname) or the same zone. Required anti-affinity means "never with a matching pod there"; preferred means "rather not".',
    'Required rules are never bent. If no node satisfies them, the pod stays Pending with the reason. Preferred rules give way when they must.',
    'Affinity is only checked when a pod is scheduled ("IgnoredDuringExecution"): changing a node\'s labels later doesn\'t move pods already running.',
  ],
  howItWorks: [
    'Four nodes with 2 CPU each: node-1 (zone a, ssd), node-2 (zone a, hdd), node-3 (zone b, ssd), node-4 (zone b, hdd). Each web pod needs 1 CPU.',
    'Choose node affinity for disk=ssd (required or preferred) and pod anti-affinity by hostname (required or preferred), and how many replicas.',
    'The scheduler\'s table shows which nodes each rule ruled out and how the preferred rules scored.',
    'With required anti-affinity and more replicas than nodes, the extra pods stay Pending.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'node', label: 'Node affinity', type: 'choice', sample: ssd.node, options: NODE_AFFINITY },
      { name: 'anti', label: 'Pod anti-affinity (per node)', type: 'choice', sample: ssd.anti, options: ANTI },
      { name: 'replicas', label: 'Replicas', type: 'number', sample: ssd.replicas, help: 'From 2 to 6.' },
    ],
    presets: [
      { label: 'Required ssd', values: ssd },
      { label: 'Preferred falls back when ssd is full', values: { node: 'preferred ssd', anti: 'none', replicas: '6' } },
      { label: 'Spread one per node', values: { node: 'none', anti: 'required', replicas: '4' } },
      { label: 'Too many replicas stay Pending', values: tooMany },
    ],
    generate: affinitySteps,
    codeLabel: 'Pseudocode',
  },
  code: affinityCode,
  prosCons: {
    pros: ['Pods land on the hardware they need', 'Anti-affinity keeps one node failure from taking every replica', 'Preferred rules express wishes without blocking scheduling'],
    cons: ['Required rules can leave pods Pending', 'Many rules make placement hard to predict', 'Rules aren\'t re-checked after placement'],
    useWhen: ['Pods need special hardware (node affinity)', 'Replicas must survive a node or zone failure (anti-affinity)'],
    avoidWhen: ['Simple even spreading across zones: topology spread constraints are easier'],
  },
  applications: [
    'Databases required onto ssd nodes',
    'Web replicas kept on different nodes with anti-affinity by hostname',
    'Replicas spread across zones with anti-affinity by zone',
  ],
  commonMistakes: [
    'Using required where preferred was meant, and leaving pods Pending when the cluster changes.',
    'Required anti-affinity with more replicas than nodes.',
    'Expecting running pods to move when node labels change.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Required anti-affinity allows one web pod per node. All four nodes now have one. What happens to the fifth pod?',
      view: allFull.view,
      options: ['It stays Pending: every node is ruled out', 'It goes to the least busy node anyway', 'It replaces an older pod', 'It is scheduled in another zone'],
      answer: 0,
      explanation: 'A required rule is a filter. With every node ruled out, the pod waits Pending with "didn\'t match pod anti-affinity rules".',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With preferred affinity for ssd and both ssd nodes full, where do new pods go?',
      options: ['To hdd nodes: preferred only adds points', 'Nowhere: they stay Pending', 'To an ssd node over capacity', 'Back to the control plane'],
      answer: 0,
      explanation: 'Preferred affinity is a score, not a filter. When the preferred nodes can\'t take the pod, the others still qualify.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line can leave a pod Pending?',
      code: 'if (required.nodeAffinity && !matches(node.labels, rule)) skip(node)\nscore += matches(node.labels, preferred.rule) ? preferred.weight : 0',
      options: ['The required filter: it rules nodes out', 'The preferred score', 'Both equally', 'Neither'],
      answer: 0,
      explanation: 'Only filters remove nodes. Scores just rank the nodes that are left.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why spread replicas with anti-affinity by hostname?',
      options: ['So one node failing doesn\'t take every replica down', 'To make pods start faster', 'To save memory', 'Because the scheduler requires it'],
      answer: 0,
      explanation: 'With one replica per node, losing a node loses one replica, not all of them.',
    },
  ],
  summary: [
    'Node affinity matches node labels; pod anti-affinity keeps matching pods apart.',
    'Required rules filter nodes; preferred rules only add score.',
    'Topology can be the node (hostname) or the zone.',
    'Required rules that nothing satisfies leave pods Pending.',
  ],
};

export default content;
