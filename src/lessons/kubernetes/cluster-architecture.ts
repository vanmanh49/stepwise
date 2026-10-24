import { clusterArchitectureCode, clusterArchitectureSteps, FAULTS } from '../../kubernetes/scenarios/cluster-architecture';
import type { LessonContent } from '../../types/lesson';

const happy = { nodes: '3', replicas: '2', fault: 'none' };

// While the scheduler is down: the pods exist but are still waiting for a node.
const downSteps = clusterArchitectureSteps({ ...happy, fault: 'scheduler-down' });
const waiting = downSteps.find((s) => s.title.includes('creates 2 pods'))!;

const content: LessonContent = {
  overview:
    'A Kubernetes cluster is a control plane that decides what should run, and worker nodes that run it. This lesson follows one kubectl apply from the API server to running containers, then takes the scheduler or etcd away to show which part does which job.',
  concept: [
    'You never start containers yourself. You tell the API server what you want (here, a Deployment with 2 replicas), and it stores that in etcd, the cluster\'s database.',
    'Controllers in the controller manager watch the API server. Each one notices objects it is responsible for and creates the next ones: the Deployment controller makes a ReplicaSet, and the ReplicaSet controller makes pods.',
    'The scheduler watches for pods with no node and picks one for each. It only writes its choice down; it starts nothing.',
    'A kubelet runs on every worker node. It watches for pods bound to its node, pulls their images and starts their containers.',
    'Every part talks only to the API server, and every part can fail on its own. That is why each one keeps working from what is stored, not from messages it might miss.',
  ],
  howItWorks: [
    'kubectl applies a Deployment named web at 0 s. The API server stores it.',
    'One second later (the watch delay), the Deployment controller creates a ReplicaSet, and a second after that the ReplicaSet controller creates the pods.',
    'The scheduler binds each Pending pod to the node with the most free CPU.',
    'Each node\'s kubelet pulls the image (2 s), starts the container (1 s) and marks the pod ready (2 s more). These timings are shortened for the lesson.',
    'Try "Scheduler down": the pods are created but wait with no node until the scheduler returns at 30 s. Try "etcd down": the API server can\'t save anything, so the apply is refused and nothing happens.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'nodes', label: 'Worker nodes', type: 'number', sample: happy.nodes, help: 'From 1 to 3, each with 4 CPU.' },
      { name: 'replicas', label: 'Replicas', type: 'number', sample: happy.replicas, help: 'From 1 to 3 pods, each asking for 1 CPU.' },
      { name: 'fault', label: 'Fault', type: 'choice', sample: happy.fault, options: FAULTS, help: 'The component is down from 0 s to 30 s.' },
    ],
    presets: [
      { label: 'Happy path', values: happy },
      { label: 'Scheduler down', values: { ...happy, fault: 'scheduler-down' } },
      { label: 'etcd down', values: { ...happy, fault: 'etcd-down' } },
    ],
    generate: clusterArchitectureSteps,
    codeLabel: 'Pseudocode',
  },
  code: clusterArchitectureCode,
  prosCons: {
    pros: ['Each component does one job and can be replaced or restarted on its own', 'Everything goes through one API, so every change is recorded in one place', 'Nodes can be added without changing the control plane'],
    cons: ['Many moving parts to run and monitor', 'A change takes several hops (and seconds) before containers start', 'If etcd is lost, the cluster forgets what it should run'],
    useWhen: ['You run many containers across several machines', 'You want the system to repair itself when something fails'],
    avoidWhen: ['One small app on one machine, where a process manager is enough'],
  },
  applications: [
    'Managed clusters such as GKE, EKS and AKS run the control plane for you and give you worker nodes',
    'Self-hosted clusters run three or five control-plane machines so one can fail',
    'Local clusters such as kind or minikube put every component on your laptop',
  ],
  commonMistakes: [
    'Thinking kubectl starts containers: it only stores the desired state in the API server.',
    'Thinking the scheduler runs pods: it only chooses a node; the kubelet runs them.',
    'Running a single etcd member in production, so one failure stops every change.',
    'Debugging a Pending pod on the node, when no node has been chosen yet: look at the scheduler\'s reason instead.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The scheduler is down. The ReplicaSet controller has just created both pods. What happens to them until 30 s, when the scheduler returns?',
      view: waiting.view,
      options: ['They wait Pending with no node', 'The kubelet picks a node for them', 'The ReplicaSet deletes and recreates them every second', 'They run on the control plane instead'],
      answer: 0,
      explanation: 'Only the scheduler assigns nodes. The pods are stored and wait; when the scheduler comes back it binds them all at once.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which component writes the cluster\'s state to disk?',
      options: ['etcd, behind the API server', 'The kubelet on each node', 'The scheduler', 'kubectl, on your machine'],
      answer: 0,
      explanation: 'Every component reads and writes through the API server, and the API server keeps everything in etcd.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is the scheduler\'s whole job?',
      code: 'createMissingPods(rs)\nbind(pod, nodeWithMostFreeCpu())\nstartContainer(pod)',
      options: ['bind(pod, nodeWithMostFreeCpu())', 'createMissingPods(rs)', 'startContainer(pod)', 'All three'],
      answer: 0,
      explanation: 'The ReplicaSet controller creates pods, the scheduler binds them to a node, and the kubelet on that node starts the container.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'etcd is down when you run kubectl apply. What happens?',
      options: ['The API server refuses the change, and nothing in the cluster changes', 'The pods start, but without a ReplicaSet', 'The kubelet starts the containers from its own copy', 'The change is queued and applied automatically later'],
      answer: 0,
      explanation: 'Nothing can be stored, so the API server refuses the request. You would have to apply it again once etcd is back.',
    },
  ],
  summary: [
    'The control plane (API server, etcd, scheduler, controller manager) decides; kubelets on worker nodes run containers.',
    'kubectl only stores desired state; controllers turn it into ReplicaSets and pods.',
    'The scheduler picks a node; the kubelet on that node pulls the image and starts the container.',
    'Each component can fail on its own: without the scheduler pods wait Pending, and without etcd nothing can change.',
  ],
};

export default content;
