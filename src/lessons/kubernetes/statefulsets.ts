import { EVENTS, POLICIES, statefulsetsCode, statefulsetsSteps, STUCK } from '../../kubernetes/scenarios/statefulsets';
import type { LessonContent } from '../../types/lesson';

const ordered = { policy: 'OrderedReady', replicas: '3', event: 'none', stuck: 'off' };

// db-0 is ready; the controller is about to make db-1.
const steps = statefulsetsSteps(ordered);
const firstReady = steps.find((s) => s.title.includes('db-0 is ready'))!;

const content: LessonContent = {
  overview:
    'A Deployment\'s pods are interchangeable: random names, shared storage, any order. Databases and clustered systems need more: each member has a name, its own disk and a place in an order. A StatefulSet gives each pod a stable identity (db-0, db-1, …) and its own PersistentVolumeClaim that follows it.',
  concept: [
    'Pods are named <set>-0, <set>-1, … and keep those names forever. A replaced db-1 is still db-1.',
    'volumeClaimTemplates give each pod its own claim, data-db-0, data-db-1, …, created with the pod and kept when the pod goes. A recreated pod mounts its old claim, data and all.',
    'With OrderedReady (the default), pods start in order and each waits until the one before is ready. Scaling down removes the highest ordinal first, one at a time. Parallel starts and stops them all at once.',
    'A headless Service (serviceName) gives each pod a stable DNS name, db-0.db, so members can find each other.',
    'Updates replace pods one at a time from the highest ordinal down, each only after the previous one is ready. A partition can hold the lower ordinals back for a canary.',
  ],
  howItWorks: [
    'StatefulSet db (postgres:15) with 3 replicas on 3 nodes, a headless Service db and a 1Gi claim per pod from StorageClass standard. Each pod writes records to its own volume.',
    'Watch the order: each pod gets a claim, a volume is provisioned, then the pod starts. The next ordinal waits for it to be ready.',
    'At 80 s: delete db-1 (it comes back with the same name and data), scale to 1 and back to 3 at 120 s (the claims wait in between), or set the image to postgres:16 (replaced from db-2 down).',
    'With db-1 never ready, it crashes on every start, and db-2 is never created.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'policy', label: 'podManagementPolicy', type: 'choice', sample: ordered.policy, options: POLICIES },
      { name: 'replicas', label: 'Replicas', type: 'number', sample: ordered.replicas, help: 'From 1 to 5 pods.' },
      { name: 'event', label: 'At 80 s', type: 'choice', sample: ordered.event, options: EVENTS },
      { name: 'stuck', label: 'db-1 never ready', type: 'choice', sample: ordered.stuck, options: STUCK },
    ],
    presets: [
      { label: 'Ordered start', values: ordered },
      { label: 'Parallel start', values: { ...ordered, policy: 'Parallel' } },
      { label: 'A deleted pod comes back', values: { ...ordered, event: 'delete db-1' } },
      { label: 'Scale down and up keeps the PVCs', values: { ...ordered, event: 'scale to 1 and back' } },
      { label: 'Rolling update from the top', values: { ...ordered, event: 'set image v2' } },
      { label: 'A stuck db-1 blocks db-2', values: { ...ordered, stuck: 'on' } },
    ],
    generate: statefulsetsSteps,
    codeLabel: 'Pseudocode',
  },
  code: statefulsetsCode,
  prosCons: {
    pros: ['Stable names and DNS for each member', 'Each pod keeps its own data across restarts and rescheduling', 'Ordered start, stop and updates for systems that need them'],
    cons: ['Slower to start and scale than a Deployment', 'A stuck pod blocks the ones after it (OrderedReady)', 'Claims are left behind after scale-down and must be cleaned up by hand'],
    useWhen: ['Databases, message brokers and consensus systems (PostgreSQL, Kafka, etcd)', 'Anything where members must be told apart'],
    avoidWhen: ['Stateless web apps: a Deployment is simpler and faster'],
  },
  applications: [
    'A PostgreSQL primary as db-0 and replicas as db-1, db-2, reached at db-0.db',
    'Kafka brokers, each with its own log volume',
    'kubectl get pvc shows data-db-0, data-db-1, … after scaling down',
  ],
  commonMistakes: [
    'Expecting scale-down to delete the claims: they stay until you delete them.',
    'Using a Deployment with one shared claim for a clustered database.',
    'Forgetting the headless Service, so pods have no stable DNS names.',
    'A pod that never gets ready, silently blocking the rest under OrderedReady.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'db-0 has just become ready (OrderedReady, 3 replicas). What does the controller do next?',
      view: firstReady.view,
      options: ['Creates data-db-1 and db-1', 'Creates db-1 and db-2 together', 'Nothing until db-0 is updated', 'Deletes db-0'],
      answer: 0,
      explanation: 'OrderedReady makes one pod at a time, each only after every lower ordinal is ready.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'db-1 is deleted. What replaces it?',
      options: ['A new pod named db-1 that mounts data-db-1', 'A pod with a new random name', 'Nothing: StatefulSets don\'t replace pods', 'db-3'],
      answer: 0,
      explanation: 'StatefulSet pods have stable identities: same name, same claim, same data.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes db-2 wait while db-1 is not ready?',
      code: "if (!exists(`db-${i}`)) createPod(`db-${i}`)\nelse if (ordered && !ready(`db-${i}`)) break",
      options: ['else if (ordered && !ready(…)) break', 'createPod(…)', 'if (!exists(…))', 'None: they all start together'],
      answer: 0,
      explanation: 'Under OrderedReady the loop stops at the first pod that isn\'t ready.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'You scale db from 3 to 1. What happens to data-db-1 and data-db-2?',
      options: ['They stay, so scaling back up brings the data back', 'They are deleted with the pods', 'They move to db-0', 'They become emptyDirs'],
      answer: 0,
      explanation: 'The default whenScaled policy is Retain.',
    },
  ],
  summary: [
    'StatefulSet pods have stable names and stable storage.',
    'OrderedReady starts pods in order and stops them in reverse.',
    'Claims outlive their pods and are reused.',
    'Updates go one pod at a time from the highest ordinal down.',
  ],
};

export default content;
