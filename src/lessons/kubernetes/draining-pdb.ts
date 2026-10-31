import { drainingPdbCode, drainingPdbSteps, PDBS, UNCORDON } from '../../kubernetes/scenarios/draining-pdb';
import type { LessonContent } from '../../types/lesson';

const noPdb = { pdb: 'none', uncordon: 'off' };
const guarded = { ...noPdb, pdb: 'minAvailable 3' };

// The drain has evicted one pod; 3 of 4 are ready and the second pod on node-1 is next.
const steps = drainingPdbSteps(guarded);
const firstEvict = steps.find((s) => s.title.includes('evicts'))!;

const content: LessonContent = {
  overview:
    'Nodes need maintenance: upgrades, reboots, replacement. kubectl drain empties a node safely, and a PodDisruptionBudget (PDB) says how many of your pods may be down at once while it does. This lesson drains a node holding two of four web pods, with and without a budget.',
  concept: [
    'kubectl drain first cordons the node, so no new pods land there, then evicts each pod on it. Evicted pods are replaced by their ReplicaSet on other nodes.',
    'Evictions go through the eviction API, which checks PodDisruptionBudgets. A PDB selects pods by label and sets minAvailable (at least this many ready) or maxUnavailable (at most this many down).',
    'If an eviction would break a budget, it is refused, and drain keeps retrying (every 5 s here) until a replacement is ready and the budget allows it.',
    'A budget that can never be met, such as minAvailable equal to the number of replicas, blocks the drain forever. Uncordoning a node lets it take new pods again but doesn\'t move existing pods back.',
  ],
  howItWorks: [
    'Four web pods behind a Service on three nodes; node-1 runs two of them. A client sends a request every 2 s.',
    'At 21 s, kubectl drains node-1: it is cordoned, then both its pods are asked to leave.',
    'Without a PDB both go at once and only 2 pods stay ready until the replacements start. With minAvailable 3 (or maxUnavailable 1), the second eviction waits.',
    'With minAvailable 4 the drain never finishes; the run stops at 90 s. With uncordon on, node-1 opens up again at 60 s.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'pdb', label: 'PodDisruptionBudget', type: 'choice', sample: noPdb.pdb, options: PDBS },
      { name: 'uncordon', label: 'Uncordon node-1 at 60 s', type: 'choice', sample: noPdb.uncordon, options: UNCORDON },
    ],
    presets: [
      { label: 'Drain without a PDB', values: noPdb },
      { label: 'Drain with minAvailable 3', values: guarded },
      { label: 'PDB blocks the drain', values: { ...noPdb, pdb: 'minAvailable 4' } },
    ],
    generate: drainingPdbSteps,
    codeLabel: 'Pseudocode',
  },
  code: drainingPdbCode,
  prosCons: {
    pros: ['Nodes can be emptied for maintenance without hand-picking pods', 'A PDB keeps enough replicas serving during voluntary disruptions', 'The Cluster Autoscaler and upgrades respect the same budgets'],
    cons: ['A strict PDB can block a drain forever', 'Budgets only cover voluntary disruptions: a crashed node ignores them', 'Draining takes longer when pods have to wait for replacements'],
    useWhen: ['Any service that must keep a minimum number of pods serving during node maintenance'],
    avoidWhen: ['Single-replica apps with minAvailable 1: the pod can never be evicted'],
  },
  applications: [
    'kubectl drain node-1 --ignore-daemonsets before upgrading a node',
    'Managed Kubernetes upgrades drain nodes one by one, respecting PDBs',
    'kubectl get pdb shows each budget\'s allowed disruptions',
  ],
  commonMistakes: [
    'minAvailable equal to replicas, so no pod can ever be evicted and drains hang.',
    'No PDB at all, so a drain can take several replicas down at once.',
    'Expecting uncordon to move pods back to the node.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'minAvailable is 3. One pod has been evicted, 3 of 4 are ready, and drain now asks to evict the second pod on node-1. What happens?',
      view: firstEvict.view,
      options: ['The eviction is refused and retried until a replacement is ready', 'It is evicted at once, because a drain ignores the PDB', 'The drain gives up and leaves node-1 as it is', 'The PDB is deleted'],
      answer: 0,
      explanation: 'Evicting it would leave 2 ready, below minAvailable 3. Once the first replacement is ready, the budget allows the eviction.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does kubectl drain do first?',
      options: ['Cordons the node so no new pods land on it', 'Deletes the node', 'Restarts the kubelet', 'Scales every Deployment to 0'],
      answer: 0,
      explanation: 'Cordoning first stops replacements from landing back on the node being emptied.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes a drain wait?',
      code: 'const allowed = readyPods(pdb.selector) - pdb.minAvailable\nif (allowed < 1) refuse(pod)\nelse deletePod(pod)',
      options: ['refuse(pod): no disruption allowed right now', 'deletePod(pod)', 'readyPods(...)', 'None: drains never wait'],
      answer: 0,
      explanation: 'When the budget has no disruption to spare, the eviction API refuses and drain retries.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Four replicas and minAvailable 4. What happens when you drain a node running one of them?',
      options: ['The drain blocks forever: no pod can ever be evicted', 'The pod moves after a short wait', 'The budget is ignored for drains', 'Kubernetes adds a fifth replica first'],
      answer: 0,
      explanation: 'Evicting any pod would drop below 4 ready, so the eviction is always refused.',
    },
  ],
  summary: [
    'kubectl drain cordons a node, then evicts its pods through the eviction API.',
    'A PodDisruptionBudget limits how many selected pods may be down at once.',
    'Refused evictions are retried until replacements are ready.',
    'A budget that can\'t be met blocks the drain; uncordon doesn\'t move pods back.',
  ],
};

export default content;
