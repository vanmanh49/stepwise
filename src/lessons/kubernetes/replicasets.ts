import { NODE_DOWN, replicaSetsCode, replicaSetsSteps } from '../../kubernetes/scenarios/replicasets';
import type { LessonContent } from '../../types/lesson';

const up = { replicas: '3', scaleTo: '5', nodeDown: 'off' };
const nodeDies = { ...up, nodeDown: 'on' };

// node-2's pod has just been marked Lost; no replacement exists yet.
const lostStep = replicaSetsSteps(nodeDies).find((s) => s.title.includes('is Lost') || s.title.includes('are Lost'))!;

const content: LessonContent = {
  overview:
    'A ReplicaSet keeps a fixed number of identical pods running. This lesson scales one up and down, then kills a node to show how its pods are replaced elsewhere, and why that takes a while.',
  concept: [
    'A ReplicaSet has three parts: how many replicas you want, a selector that finds its pods, and a pod template to make new ones from.',
    'Its controller counts the pods it owns. Too few, and it creates more from the template; too many, and it deletes the surplus: pods not yet scheduled first, then pods that aren\'t ready, then the newest.',
    'Scaling is just changing the replicas number. The controller does the rest.',
    'When a node dies, the control plane first has to notice (no heartbeat for longer than the grace period: 20 s here, 50 s by default). Its pods are then marked Lost (this lesson\'s name for them; kubectl shows them as Unknown, then Terminating) and deleted a little later (10 s here, 5 minutes by default), and only then does the ReplicaSet see the gap and create replacements on healthy nodes.',
  ],
  howItWorks: [
    'kubectl applies a ReplicaSet named web on 3 nodes. Its pods are spread over the nodes with the most free CPU.',
    'At 20 s, kubectl scales it to a new number of replicas, and the controller creates or deletes the difference.',
    'With node-2 dying instead, node-2 goes silent at 20 s. Its last heartbeat was at 10 s, so it goes NotReady at the 35 s check.',
    'Its pods are Lost at 35 s and deleted at 45 s. The ReplicaSet then creates replacements, which the scheduler puts on node-1 and node-3.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'replicas', label: 'Replicas', type: 'number', sample: up.replicas, help: 'From 1 to 6.' },
      { name: 'scaleTo', label: 'Scale to (at 20 s)', type: 'number', sample: up.scaleTo, help: 'From 0 to 6. Ignored when node-2 dies.' },
      { name: 'nodeDown', label: 'node-2 dies at 20 s', type: 'choice', sample: up.nodeDown, options: NODE_DOWN },
    ],
    presets: [
      { label: 'Scale 3 → 5', values: up },
      { label: 'Scale 5 → 2', values: { ...up, replicas: '5', scaleTo: '2' } },
      { label: 'Node dies, pods move', values: nodeDies },
    ],
    generate: replicaSetsSteps,
    codeLabel: 'Pseudocode',
  },
  code: replicaSetsCode,
  prosCons: {
    pros: ['Keeps the number of pods steady through crashes, deletions and node failures', 'Scaling is a one-number change', 'Spreads load over several identical pods'],
    cons: ['Replacing pods from a dead node takes the grace period plus the eviction delay', 'Changing the pod template does not update existing pods', 'Any pod whose labels match the selector is counted, even one you created by hand'],
    useWhen: ['You need N identical, interchangeable pods'],
    avoidWhen: ['You want to roll out new versions: use a Deployment, which manages ReplicaSets for you', 'Each pod needs its own identity or storage: use a StatefulSet'],
  },
  applications: [
    'Every Deployment creates and manages ReplicaSets underneath',
    'kubectl scale changes the replicas to handle more or less traffic',
    'The Horizontal Pod Autoscaler changes replicas automatically from CPU load',
  ],
  commonMistakes: [
    'Expecting a dead node\'s pods to be replaced instantly: the cluster waits to be sure the node is gone.',
    'Creating ReplicaSets directly instead of Deployments, and then having no way to roll out a new image.',
    'Giving a hand-made pod the same labels, so the ReplicaSet counts it and deletes one of its own.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'node-2 is NotReady and its pod is Lost. The ReplicaSet wants 3 pods. When does it create a replacement?',
      view: lostStep.view,
      options: ['After the Lost pod is deleted, 10 s later', 'Right now, as soon as the node is NotReady', 'Never: the pod comes back when the node does', 'Only after someone scales the ReplicaSet'],
      answer: 0,
      explanation: 'A Lost pod still counts as one of the 3. Once node lifecycle deletes it, the ReplicaSet sees 2 of 3 and creates one.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A ReplicaSet with 5 replicas is scaled to 2. One of its pods is still Pending. Which pods go first?',
      options: ['The Pending pod first, then not-ready ones, then the newest', 'The oldest pods first, to keep the newest running', 'Random pods', 'The pods on the busiest node, to even out the load'],
      answer: 0,
      explanation: 'Removing a pod that isn\'t running yet costs nothing, so unscheduled and not-ready pods go before healthy ones.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which part of the loop handles a scale-up?',
      code: 'for (let i = pods.length; i < rs.replicas; i++)\n  createPod(rs.template)',
      options: ['The createPod loop: one pod per missing replica', 'deletePod', 'markNotReady', 'Nothing: scaling needs kubectl to create pods'],
      answer: 0,
      explanation: 'Raising replicas makes pods.length smaller than rs.replicas, so the loop creates the difference from the template.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does Kubernetes wait before replacing pods on a silent node?',
      options: ['The node might only be briefly unreachable, and running two copies can be worse', 'It has to download the image again first', 'The scheduler only runs once a minute', 'Pods can\'t be deleted while their node is down'],
      answer: 0,
      explanation: 'A short network blip shouldn\'t move every pod. The grace period and eviction delay trade recovery speed for stability.',
    },
  ],
  summary: [
    'A ReplicaSet = replicas + selector + pod template.',
    'Its controller creates missing pods and deletes surplus ones (unscheduled, then not ready, then newest).',
    'Scaling only changes the replicas number.',
    'A dead node\'s pods are replaced only after the grace period and the eviction delay.',
  ],
};

export default content;
