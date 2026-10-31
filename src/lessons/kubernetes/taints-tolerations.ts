import { EFFECTS, SECONDS, SWITCH, taintsTolerationsCode, taintsTolerationsSteps } from '../../kubernetes/scenarios/taints-tolerations';
import type { LessonContent } from '../../types/lesson';

const skipped = { toleration: 'off', effect: 'NoSchedule', seconds: 'none' };
const noExecute = { ...skipped, effect: 'NoExecute' };

// node-3 has just been tainted gpu=true:NoExecute; its pod has no toleration.
const steps = taintsTolerationsSteps(noExecute);
const tainted = steps.find((s) => s.title.startsWith('kubectl taints'))!;

const content: LessonContent = {
  overview:
    'Labels and affinity let a pod choose nodes. Taints work the other way round: a node pushes pods away unless they tolerate it. This lesson taints one of three nodes and runs pods with and without a matching toleration.',
  concept: [
    'A taint is key=value:effect on a node, such as gpu=true:NoSchedule. A toleration on a pod says "I can live with that taint".',
    'NoSchedule keeps new pods without a toleration off the node. PreferNoSchedule only makes the node less attractive. NoExecute also evicts pods already running there that don\'t tolerate it.',
    'A toleration allows a pod onto a tainted node; it doesn\'t send it there. To force pods onto special nodes, combine a toleration with node affinity.',
    'A NoExecute toleration can set tolerationSeconds: the pod may stay that long on the tainted node (counted from the taint, or from when the pod lands there), then it is evicted. Kubernetes uses this for nodes that become unreachable, where pods tolerate the taint for 5 minutes by default; those nodes also get a NoSchedule taint, so new pods don\'t land there in the meantime.',
  ],
  howItWorks: [
    'Three nodes. A Deployment named web asks for 3 pods.',
    'With NoSchedule, node-3 is tainted gpu=true:NoSchedule from the start. Watch the scheduler\'s table rule it out, unless the pods tolerate it.',
    'With NoExecute, the pods start spread over all three nodes, and node-3 is tainted gpu=true:NoExecute at 20 s.',
    'With a toleration and tolerationSeconds 10, the pod on node-3 stays 10 s longer before it is evicted. Its replacement tolerates the taint and node-3 is now the emptiest node, so it lands there and is evicted 10 s later, again and again. That run stops at 60 s.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'toleration', label: 'Pods tolerate gpu=true', type: 'choice', sample: skipped.toleration, options: SWITCH },
      { name: 'effect', label: 'Taint effect', type: 'choice', sample: skipped.effect, options: EFFECTS, help: 'NoSchedule from the start; NoExecute at 20 s.' },
      { name: 'seconds', label: 'tolerationSeconds', type: 'choice', sample: skipped.seconds, options: SECONDS, help: 'Only for NoExecute.' },
    ],
    presets: [
      { label: 'Tainted node is skipped', values: skipped },
      { label: 'A toleration allows, not forces', values: { ...skipped, toleration: 'on' } },
      { label: 'NoExecute evicts', values: noExecute },
      { label: 'tolerationSeconds delays it', values: { ...noExecute, toleration: 'on', seconds: '10' } },
    ],
    generate: taintsTolerationsSteps,
    codeLabel: 'Pseudocode',
  },
  code: taintsTolerationsCode,
  prosCons: {
    pros: ['Keeps special or expensive nodes for the pods that need them', 'NoExecute clears a node of unwanted pods without deleting them by hand', 'tolerationSeconds gives pods time before they are moved'],
    cons: ['A toleration alone doesn\'t place pods on the tainted node', 'A forgotten taint leaves a node silently unused', 'NoExecute evicts at once, which can surprise running workloads'],
    useWhen: ['Dedicated nodes (GPUs, licences, teams)', 'Taking a node out of service for maintenance'],
    avoidWhen: ['You just want pods to prefer some nodes: use node affinity instead'],
  },
  applications: [
    'GPU nodes tainted so only GPU workloads run there',
    'Control-plane nodes carry a NoSchedule taint so ordinary pods stay off',
    'Kubernetes taints unreachable or not-ready nodes with NoExecute and evicts pods after 300 s by default',
  ],
  commonMistakes: [
    'Adding a toleration and expecting the pod to land on the tainted node.',
    'Using NoExecute when NoSchedule was meant, and evicting running pods.',
    'Misspelling the taint key in the toleration, so it matches nothing.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'node-3 has just been tainted gpu=true:NoExecute. Its pod has no toleration. What happens to that pod?',
      view: tainted.view,
      options: ['It is evicted now, and its replacement lands on another node', 'Nothing: taints only affect new pods', 'It is evicted after 5 minutes', 'It keeps running but gets no traffic'],
      answer: 0,
      explanation: 'NoExecute removes pods that don\'t tolerate it straight away. The ReplicaSet\'s replacement can\'t go to node-3 either.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Pods tolerate gpu=true:NoSchedule on node-3. Where do they run?',
      options: ['Wherever they score best, which may or may not be node-3', 'Only on node-3', 'Nowhere: they need affinity too', 'Only on nodes without taints'],
      answer: 0,
      explanation: 'A toleration only removes the restriction. Use node affinity as well to require node-3.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line gives a tolerating pod some time before it is evicted?',
      code: 'if (!tolerates(pod, taint)) evict(pod)\nelse if (toleration.seconds) evictAfter(pod, toleration.seconds)',
      options: ['evictAfter(pod, toleration.seconds)', 'evict(pod)', 'Neither: tolerating pods stay forever', 'Both run, one after the other'],
      answer: 0,
      explanation: 'With tolerationSeconds, the pod tolerates the NoExecute taint only for that long.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is the difference between NoSchedule and NoExecute?',
      options: ['NoExecute also evicts pods already running there; NoSchedule only stops new ones', 'NoSchedule evicts running pods, and NoExecute only stops new ones', 'They are the same, and only the names differ between versions', 'NoExecute only applies to DaemonSets'],
      answer: 0,
      explanation: 'Both keep untolerating pods from being scheduled; only NoExecute removes the ones already running.',
    },
  ],
  summary: [
    'Taints repel pods; tolerations let pods accept a taint.',
    'NoSchedule stops new pods, PreferNoSchedule discourages them, NoExecute evicts running ones too.',
    'A toleration allows a node; it doesn\'t choose it.',
    'tolerationSeconds lets a pod stay a while after a NoExecute taint appears.',
  ],
};

export default content;
