import { CHANGES, CRD, ON_OFF, operatorsCrdsCode, operatorsCrdsSteps } from '../../kubernetes/scenarios/operators-crds';
import type { LessonContent } from '../../types/lesson';

const base = { crd: 'installed', change: 'nothing', backup: 'on', handEdit: 'off', outage: 'off' };

// Someone has just scaled StatefulSet db to 1 by hand.
const steps = operatorsCrdsSteps({ ...base, handEdit: 'on' });
const edited = steps.find((s) => s.title.includes('scales StatefulSet db to 1'))!;

const content: LessonContent = {
  overview:
    'Kubernetes knows how to run Deployments, but not how to run PostgreSQL: when to back up, how to upgrade, what to do when a member fails. An operator teaches it. A CustomResourceDefinition (CRD) adds a new kind, such as Database, to the API server, and the operator is a controller that turns each Database into ordinary objects and keeps them right.',
  concept: [
    'A CRD registers a new kind with the API server. After that, kubectl apply accepts Database objects and stores them like any other. Before it, they are refused: no matches for kind "Database".',
    'The operator is a program running in a pod, built the same way as the built-in controllers: watch, compare desired with actual, act. Its desired state is the Database\'s spec.',
    'For each Database it creates and owns ordinary objects: here a Secret for credentials, a headless Service and a StatefulSet. Hand edits to those are put back on the next reconcile.',
    'It encodes operations knowledge: before changing the version, run a backup Job and wait for it; then roll the StatefulSet. It reports progress in the Database\'s status.',
    'Because it is level-triggered, an operator that was down simply catches up when it returns. Real operators also use finalizers to clean up when a Database is deleted (not shown here).',
  ],
  howItWorks: [
    'The CRD databases.example.com and the db-operator Deployment are applied, then Database db (3 replicas, version 15, backup on).',
    'The operator creates Secret db-credentials, Service db and StatefulSet db; the StatefulSet starts db-0, db-1, db-2 with a volume each.',
    'At 70 s someone can scale the StatefulSet to 1 by hand; at 90 s the Database can ask for 5 replicas or version 16.',
    'With the outage on, db-operator is scaled to 0 from 80 s to 120 s: changes to the Database wait until it is back.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'crd', label: 'CRD', type: 'choice', sample: base.crd, options: CRD },
      { name: 'change', label: 'At 90 s, the Database asks for', type: 'choice', sample: base.change, options: CHANGES },
      { name: 'backup', label: 'Back up before upgrades', type: 'choice', sample: base.backup, options: ON_OFF },
      { name: 'handEdit', label: 'Someone scales StatefulSet db to 1 at 70 s', type: 'choice', sample: base.handEdit, options: ON_OFF },
      { name: 'outage', label: 'Operator down 80–120 s', type: 'choice', sample: base.outage, options: ON_OFF },
    ],
    presets: [
      { label: 'The operator builds the database', values: base },
      { label: 'No CRD: refused', values: { ...base, crd: 'missing' } },
      { label: 'Hand edits are put back', values: { ...base, handEdit: 'on' } },
      { label: 'Upgrade with a backup first', values: { ...base, change: 'version 15 → 16' } },
      { label: 'Operator down: changes wait', values: { ...base, change: 'replicas 3 → 5', outage: 'on' } },
    ],
    generate: operatorsCrdsSteps,
    codeLabel: 'Pseudocode',
  },
  code: operatorsCrdsCode,
  prosCons: {
    pros: ['One small object describes a whole system', 'Operations knowledge (backups, upgrades, failover) runs as code, all the time', 'Works with kubectl, RBAC and GitOps like any built-in kind'],
    cons: ['An operator is software you must trust, upgrade and monitor', 'A buggy operator can break what it manages', 'Hand edits to owned objects are silently undone'],
    useWhen: ['Running databases, queues and other stateful systems with known procedures', 'Platform teams offering self-service resources'],
    avoidWhen: ['A plain Deployment or StatefulSet already does the job'],
  },
  applications: [
    'CloudNativePG and the Zalando operator for PostgreSQL',
    'cert-manager\'s Certificate kind, turned into Secrets with TLS certificates',
    'Prometheus Operator: ServiceMonitor objects become scrape configuration',
  ],
  commonMistakes: [
    'Applying custom resources before their CRD is installed.',
    'Editing what the operator owns instead of the custom resource, and seeing the change reverted.',
    'Forgetting the operator itself needs replicas, resources and monitoring.',
    'Assuming an operator acts while it is down: changes wait until it returns.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Someone has scaled StatefulSet db to 1 by hand. The Database still says 3 replicas. What happens next?',
      view: edited.view,
      options: ['The operator sets the StatefulSet back to 3', 'The Database changes to 1 replica', 'Nothing: hand edits win', 'The operator deletes the Database'],
      answer: 0,
      explanation: 'The operator owns the StatefulSet and reconciles it to the Database\'s spec.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'kubectl apply of a Database fails with "no matches for kind Database". Why?',
      options: ['Its CustomResourceDefinition isn\'t installed', 'The operator is down', 'The StatefulSet is missing', 'etcd is full'],
      answer: 0,
      explanation: 'The API server only knows Database once the CRD registers it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes the upgrade wait for a backup?',
      code: 'if (db.spec.backup && !backupDone(db)) runBackupJob(db)\nelse set.image = `postgres:${db.spec.version}`',
      options: ['if (db.spec.backup && !backupDone(db)) runBackupJob(db)', 'set.image = …', 'Neither: upgrades never wait', 'Both run together'],
      answer: 0,
      explanation: 'The image changes only once the backup Job is Complete (or backups are off).',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'The operator is down when the Database asks for 5 replicas. What happens?',
      options: ['Nothing until it returns; then it scales the StatefulSet to 5 in one pass', 'The API server scales the StatefulSet in its place', 'The change is lost, and must be made again once it returns', 'The StatefulSet scales itself'],
      answer: 0,
      explanation: 'Operators are level-triggered controllers: they read the current state when they come back.',
    },
  ],
  summary: [
    'A CRD adds a new kind to the API server.',
    'An operator is a controller for that kind, running as a pod.',
    'It creates and owns ordinary objects and undoes hand edits.',
    'It encodes procedures like backup-before-upgrade, and catches up after downtime.',
  ],
};

export default content;
