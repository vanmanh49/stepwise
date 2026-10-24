import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Database, Scenario } from '../model';
import { deployment, scenarioSteps } from './shared';

export const operatorsCrdsCode = `// A CustomResourceDefinition teaches the API server a new kind: Database
// db-operator, a pod, watches Databases and what it made for them
for (const db of databases) {
  ensure(secret(db), headlessService(db))
  const set = ensure(statefulSet(db))
  if (set.replicas !== db.spec.replicas) set.replicas = db.spec.replicas // undo hand edits
  if (version(set) !== db.spec.version) {
    if (db.spec.backup && !backupDone(db)) runBackupJob(db)              // first, once
    else set.image = \`postgres:\${db.spec.version}\`                       // rolling update
  }
  db.status = { phase, ready, version }                                   // what kubectl get shows
}`;

export const CRD = ['installed', 'missing'];
export const CHANGES = ['nothing', 'replicas 3 → 5', 'version 15 → 16'];
export const ON_OFF = ['off', 'on'];

export function operatorsCrdsScenario(values: Record<string, string>): Read<Scenario> {
  const crd = readChoice(values, 'crd', 'CRD', CRD);
  if (!crd.ok) return crd;
  const change = readChoice(values, 'change', 'At 90 s', CHANGES);
  if (!change.ok) return change;
  const backup = readChoice(values, 'backup', 'Back up before upgrades', ON_OFF);
  if (!backup.ok) return backup;
  const handEdit = readChoice(values, 'handEdit', 'Someone scales StatefulSet db to 1 at 70 s', ON_OFF);
  if (!handEdit.ok) return handEdit;
  const outage = readChoice(values, 'outage', 'Operator down 80–120 s', ON_OFF);
  if (!outage.ok) return outage;
  const database = (spec: Partial<Database['spec']> = {}): Database => ({ kind: 'Database', name: 'db', spec: { replicas: 3, version: 15, backup: backup.value === 'on', ...spec } });
  const changed: Record<string, Partial<Database['spec']> | undefined> = { nothing: undefined, 'replicas 3 → 5': { replicas: 5 }, 'version 15 → 16': { version: 16 } };
  const next = changed[change.value];
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: { kind: 'StorageClass', name: 'standard', reclaimPolicy: 'Delete' } },
    ...(crd.value === 'installed' ? [{ at: 0, kind: 'apply' as const, object: { kind: 'CustomResourceDefinition' as const, name: 'databases.example.com', group: 'example.com', resource: 'Database' as const } }] : []),
    { at: 0, kind: 'apply', object: deployment('db-operator', 1, { image: 'db-operator:1.0' }) },
    { at: 2, kind: 'apply', object: database() },
    ...(handEdit.value === 'on' ? [{ at: 70, kind: 'scale' as const, target: 'db', replicas: 1 }] : []),
    ...(outage.value === 'on' ? [{ at: 80, kind: 'scale' as const, target: 'db-operator', replicas: 0 }, { at: 120, kind: 'scale' as const, target: 'db-operator', replicas: 1 }] : []),
    ...(next ? [{ at: 90, kind: 'apply' as const, object: database(next) }] : []),
  ];
  return { ok: true, value: { nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4 }, { name: 'node-3', cpu: 4 }], actions, faults: [], until: 220, runToEnd: true } };
}

export function operatorsCrdsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(operatorsCrdsScenario(values), "Can't run this operator", {
    code: operatorsCrdsCode,
    focus: 'db-operator',
    lines: { operator: 'for (const db of databases)', 'refuse-write': '// A CustomResourceDefinition', 'create-pod': 'ensure(statefulSet(db))', job: 'runBackupJob(db)' },
    explain: (event) => {
      if (event.kind === 'refuse-write' && event.reason?.includes('Database')) return { why: 'The API server only accepts kinds it knows. Database isn\'t built in: until a CustomResourceDefinition registers it, kubectl apply is refused and nothing else happens.' };
      if (event.kind === 'action' && event.text.includes('CustomResourceDefinition')) return { why: 'The CRD adds a new kind, Database, to the API server. It stores Database objects like any other, but nothing acts on them until an operator runs.' };
      if (event.by !== 'operator') return undefined;
      if (event.text.includes('now wants')) return { line: 'set.replicas = db.spec.replicas', why: 'The Database\'s spec changed, so the operator changes what it owns to match: the StatefulSet controller then adds the pods.' };
      if (event.text.includes('sets it back')) return { line: 'set.replicas = db.spec.replicas', why: 'Someone edited the StatefulSet by hand. The operator owns it, so on its next reconcile it puts it back to what the Database says. Change the Database, not what the operator made.' };
      if (event.text.includes('backs the data up')) return { line: 'runBackupJob(db)', why: 'The operator knows how to run this database: before an upgrade it takes a backup with a Job, and waits for it to finish. That knowledge, written as code, is what an operator is.' };
      if (event.text.includes('upgrades')) return { line: 'set.image =', why: 'The backup is Complete, so the operator changes the StatefulSet\'s image. The StatefulSet controller then replaces the pods one at a time from db-2 down.' };
      if (event.text.includes(' is ')) return { line: 'db.status =', why: 'The operator writes what it sees into the Database\'s status, so kubectl get database db shows the phase and version.' };
      return { line: 'ensure(secret(db)', why: 'The operator turns the one Database object into the ordinary objects that run it: a Secret, a headless Service and a StatefulSet.' };
    },
  });
}
