import { daemonsetsCode, daemonsetsSteps, NODE_SELECTORS, ON_OFF } from '../../kubernetes/scenarios/daemonsets';
import type { LessonContent } from '../../types/lesson';

const base = { toleration: 'off', nodeSelector: 'none', join: 'off', drain: 'off', update: 'off' };

// node-4 has just joined the cluster: what does the DaemonSet do?
const steps = daemonsetsSteps({ ...base, join: 'on' });
const joined = steps.find((s) => s.title.includes('node-4 joins'))!;

const content: LessonContent = {
  overview:
    'Some software must run on every node: log collectors, monitoring agents, network plugins. A DaemonSet runs one copy of a pod on each node it fits, adds one when a node joins and removes it when a node no longer fits. This lesson runs a log agent on a small cluster with a tainted GPU node.',
  concept: [
    'A DaemonSet has no replica count. Its desired number is the number of nodes it fits: nodes matching its nodeSelector (or node affinity) whose taints it tolerates.',
    'For each such node without a pod, the controller creates one pinned to that node with node affinity on kubernetes.io/hostname; the normal scheduler binds it.',
    'Daemon pods get tolerations for unschedulable and not-ready nodes automatically. A cordoned node keeps its agent, a NotReady node\'s agent is not evicted, and kubectl drain --ignore-daemonsets leaves them in place.',
    'Taints still apply: a node tainted gpu=true:NoSchedule gets no agent unless the template tolerates it.',
    'Updates roll one node at a time (maxUnavailable 1 by default): the old pod goes, the new one starts, then the next node.',
  ],
  howItWorks: [
    'Three nodes: node-1 and node-3 have disk=ssd, node-2 has disk=hdd, and node-3 is tainted gpu=true:NoSchedule. DaemonSet log-agent and a 3-pod web Deployment run on them.',
    'Without a toleration, the agent runs on node-1 and node-2 only. With nodeSelector disk=ssd, only on ssd nodes.',
    'With node-4 joining at 30 s, it gets an agent a second later. With the drain at 50 s, web pods leave node-1 but the agent stays.',
    'With the new image at 70 s, agents are replaced one node at a time.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'toleration', label: 'Tolerate gpu taint', type: 'choice', sample: base.toleration, options: ON_OFF },
      { name: 'nodeSelector', label: 'nodeSelector', type: 'choice', sample: base.nodeSelector, options: NODE_SELECTORS },
      { name: 'join', label: 'node-4 joins at 30 s', type: 'choice', sample: base.join, options: ON_OFF },
      { name: 'drain', label: 'Drain node-1 at 50 s', type: 'choice', sample: base.drain, options: ON_OFF },
      { name: 'update', label: 'New image at 70 s', type: 'choice', sample: base.update, options: ON_OFF },
    ],
    presets: [
      { label: 'One pod per node', values: base },
      { label: 'A new node gets one', values: { ...base, join: 'on' } },
      { label: 'A toleration adds node-3', values: { ...base, toleration: 'on' } },
      { label: 'nodeSelector limits it', values: { ...base, nodeSelector: 'disk=ssd', toleration: 'on' } },
      { label: 'Drain leaves it in place', values: { ...base, drain: 'on' } },
      { label: 'Rolling update node by node', values: { ...base, update: 'on' } },
    ],
    generate: daemonsetsSteps,
    codeLabel: 'Pseudocode',
  },
  code: daemonsetsCode,
  prosCons: {
    pros: ['Every node gets the agent with no counting', 'New nodes are covered automatically', 'Agents survive cordons, drains and NotReady nodes'],
    cons: ['Each agent uses resources on every node', 'An update touches every node, one at a time', 'Taints and selectors make it easy to miss nodes by accident'],
    useWhen: ['Node-level agents: logs, metrics, security scanners, CNI and storage plugins'],
    avoidWhen: ['Ordinary apps that just need N copies: use a Deployment'],
  },
  applications: [
    'Fluent Bit or Vector collecting container logs on every node',
    'The Prometheus node exporter',
    'kube-proxy and CNI plugins such as Cilium run as DaemonSets',
  ],
  commonMistakes: [
    'Forgetting tolerations, so tainted nodes run no agent.',
    'Running kubectl drain without --ignore-daemonsets and wondering why it refuses.',
    'Giving a DaemonSet large requests, multiplied by every node.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'node-4 has just joined the cluster. What does the DaemonSet controller do?',
      view: joined.view,
      options: ['Creates a log-agent pod pinned to node-4', 'Nothing until someone scales it', 'Moves the agent from node-1 to node-4', 'Deletes the agent on node-2'],
      answer: 0,
      explanation: 'A DaemonSet watches nodes: every node it fits gets one pod.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does the agent stay on node-1 when it is drained?',
      options: ['Drain skips DaemonSet pods, and the pod tolerates the cordon', 'Its PDB blocks the eviction', 'It has a higher QoS class', 'Drain only removes Deployment pods by chance'],
      answer: 0,
      explanation: 'kubectl drain --ignore-daemonsets leaves daemon pods, which tolerate node.kubernetes.io/unschedulable.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which condition keeps the agent off node-3?',
      code: 'const fits = matches(nodeSelector, node.labels) && toleratesTaints(node)\nif (fits && !podOn(node)) createPod(pinnedTo(node))',
      options: ['toleratesTaints(node)', 'matches(nodeSelector, …)', '!podOn(node)', 'createPod(…)'],
      answer: 0,
      explanation: 'node-3 is tainted gpu=true:NoSchedule and the agent has no toleration for it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How many pods does a DaemonSet with nodeSelector disk=ssd want on this cluster, with the gpu toleration?',
      options: ['2: node-1 and node-3', '3: every node', '1: node-1', 'It depends on its replicas field'],
      answer: 0,
      explanation: 'DaemonSets have no replicas: the count is the nodes they fit.',
    },
  ],
  summary: [
    'A DaemonSet runs one pod on every node it fits.',
    'Joining nodes get a pod; nodes that stop fitting lose it.',
    'Daemon pods tolerate cordons and NotReady nodes; drains skip them.',
    'Updates go one node at a time.',
  ],
};

export default content;
