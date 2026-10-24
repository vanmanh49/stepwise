import { BACK, clusterAutoscalerCode, clusterAutoscalerSteps } from '../../kubernetes/scenarios/cluster-autoscaler';
import type { LessonContent } from '../../types/lesson';

const up = { replicas: '10', max: '4', back: 'off' };

// The Deployment was just scaled to 10: pool-1 is full and the rest wait Pending.
const steps = clusterAutoscalerSteps(up);
const pending = steps[steps.findIndex((s) => s.title.startsWith('Cluster Autoscaler adds')) - 1]!;

const content: LessonContent = {
  overview:
    'The HPA adds pods, but pods need nodes with room. The Cluster Autoscaler adds nodes when pods can\'t be placed and removes nodes that sit mostly idle. This lesson scales a Deployment beyond what one node can hold, then back down.',
  concept: [
    'The Cluster Autoscaler watches for Pending pods that are unschedulable only for lack of room. If a new node from the pool would fit them, it adds one, up to the pool\'s maximum.',
    'A new node takes time to boot (20 s here; usually a minute or two in the cloud). The pods wait Pending until it is Ready, then the scheduler places them.',
    'It removes a node that has been under-used (less than half of its CPU requested) for a while (60 s here, 10 minutes by default), if its pods fit elsewhere and the pool stays at or above its minimum. It drains the node first, respecting PodDisruptionBudgets.',
    'It counts requests, not real use: a node full of idle pods with big requests is "full".',
  ],
  howItWorks: [
    'A node pool starts with one node (pool-1, 4 CPU). The Deployment web starts with 2 pods of 1 CPU each.',
    'At 10 s, kubectl scales web to the number you choose. Pods that don\'t fit wait Pending.',
    'Every 5 s the autoscaler checks: if the room left (counting nodes still booting) can\'t hold the waiting pods, it adds a node, up to the pool maximum.',
    'With scale back on, web goes back to 2 pods at 80 s; empty or nearly empty nodes are drained and removed after 60 s.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'replicas', label: 'Scale web to (at 10 s)', type: 'number', sample: up.replicas, help: 'From 2 to 14 pods of 1 CPU.' },
      { name: 'max', label: 'Pool max nodes', type: 'number', sample: up.max, help: 'From 2 to 4 nodes of 4 CPU.' },
      { name: 'back', label: 'Scale back to 2 at 80 s', type: 'choice', sample: up.back, options: BACK },
    ],
    presets: [
      { label: 'Scale up for Pending pods', values: up },
      { label: 'Hits max nodes', values: { ...up, max: '2' } },
      { label: 'Scale down idle nodes', values: { ...up, back: 'on' } },
    ],
    generate: clusterAutoscalerSteps,
    codeLabel: 'Pseudocode',
  },
  code: clusterAutoscalerCode,
  prosCons: {
    pros: ['The cluster grows when pods need room and shrinks when they don\'t', 'Works together with the HPA: one adds pods, the other adds nodes', 'Respects PodDisruptionBudgets when removing nodes'],
    cons: ['New nodes take minutes, so pods wait during sudden spikes', 'Big pod requests can keep mostly idle nodes alive', 'Pods that can\'t move (local storage, strict PDBs) block scale-down'],
    useWhen: ['Cloud clusters with changing load and node groups that can grow and shrink'],
    avoidWhen: ['Fixed hardware you can\'t add to', 'Workloads that need capacity instantly: keep spare nodes instead'],
  },
  applications: [
    'Managed Kubernetes (GKE, EKS, AKS) runs it per node group or node pool',
    'Paired with the HPA so pod and node counts both follow traffic',
    'Karpenter is a newer alternative that picks node sizes per pod',
  ],
  commonMistakes: [
    'Expecting pods to start instantly after scaling: the new node has to boot first.',
    'Setting pool max too low, leaving pods Pending forever.',
    'Huge requests that keep under-used nodes from ever being removed.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'pool-1 is full and 6 pods wait Pending, each needing 1 CPU. Pool nodes have 4 CPU and the max is 4. What does the autoscaler do on its next scan?',
      view: pending.view,
      options: ['Adds one node, which boots before taking pods', 'Adds six nodes at once', 'Deletes the Pending pods', 'Moves pods off pool-1'],
      answer: 0,
      explanation: 'It adds a pool node (one per scan here). On the next scan it counts the booting node\'s room and adds another only if that isn\'t enough.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'When does the Cluster Autoscaler remove a node?',
      options: ['After it has been under half requested for a while and its pods fit elsewhere', 'As soon as one pod leaves it', 'Every night', 'Only when the node fails'],
      answer: 0,
      explanation: 'It waits (60 s here, 10 minutes by default), checks the pods can move, then drains and deletes the node.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which condition stops it from adding a node for a pod that would never fit one?',
      code: 'if (pending.some(fitsEmptyPoolNode) && freeRoom < pendingRequests)\n  if (pool.size < max) addNode()',
      options: ['fitsEmptyPoolNode: the pod must fit an empty pool node', 'pool.size < max', 'freeRoom < pendingRequests', 'None: it always adds a node'],
      answer: 0,
      explanation: 'A pod bigger than any pool node can\'t be helped by adding nodes, so it doesn\'t trigger a scale-up.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How do the HPA and the Cluster Autoscaler work together?',
      options: ['The HPA adds pods; the Cluster Autoscaler adds nodes when those pods don\'t fit', 'They are the same thing', 'The Cluster Autoscaler adds pods', 'The HPA adds nodes'],
      answer: 0,
      explanation: 'Each scales one layer: pods follow load, nodes follow pods.',
    },
  ],
  summary: [
    'The Cluster Autoscaler adds nodes for Pending pods that a new node would fit.',
    'New nodes boot first; pods wait Pending meanwhile.',
    'Idle nodes (under half requested for a while) are drained and removed, never below min.',
    'It counts requests, and it stops at the pool maximum.',
  ],
};

export default content;
