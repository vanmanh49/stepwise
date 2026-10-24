import { BACKUP_RUN_S, type Database, type Job, type Obj, type StatefulSet } from '../model';
import { withImage } from './deployment';
import type { Change, Reconcile } from './types';

const APP = [{ key: 'app', op: '=' as const, values: ['db'] }];
const image = (version: number) => `postgres:${version}`;
const by = { by: 'operator' as const };

function statefulSet(db: Database): StatefulSet {
  return {
    kind: 'StatefulSet',
    name: db.name,
    replicas: db.spec.replicas,
    selector: APP,
    template: { labels: { app: 'db' }, image: image(db.spec.version), cpu: 1, restartPolicy: 'Always' },
    serviceName: db.name,
    podManagementPolicy: 'OrderedReady',
    claims: [{ name: 'data', requestGi: 1, storageClass: 'standard' }],
    whenScaled: 'Retain',
    revision: 1,
    history: [],
  };
}

function backupJob(db: Database, from: string): Job {
  return {
    kind: 'Job',
    name: `${db.name}-backup-${db.spec.version}`,
    template: { labels: { app: 'db-backup' }, image: from, cpu: 1, restartPolicy: 'Never', run: { seconds: BACKUP_RUN_S, exitCode: 0 } },
    completions: 1,
    parallelism: 1,
    backoffLimit: 1,
    status: { active: 0, succeeded: 0, failed: 0 },
  };
}

/**
 * The db-operator: for each Database it makes sure a Secret, a headless Service and a StatefulSet exist and match the
 * spec, putting back any hand edits. A version change runs a backup Job first when asked, then a rolling update.
 */
export const reconcileDatabases: Reconcile = (ctx) => {
  const changes: Change[] = [];
  const { store } = ctx;
  for (const db of store.list('Database')) {
    const say = (text: string, subjects: string[]) => ({ kind: 'operator' as const, ...by, subjects: [...subjects, db.name], text: `db-operator: ${text}` });
    const create = (object: Obj, text: string) => changes.push({ write: { op: 'create', object }, event: say(text, [object.name]) });
    if (!store.get('Secret', `${db.name}-credentials`)) create({ kind: 'Secret', name: `${db.name}-credentials`, data: { password: 's3cr3t' } }, `Database ${db.name} needs credentials: it creates Secret ${db.name}-credentials`);
    if (!store.get('Service', db.name)) create({ kind: 'Service', name: db.name, selector: APP }, `Database ${db.name} needs a stable address: it creates headless Service ${db.name}`);
    const set = store.get('StatefulSet', db.name);
    if (!set) {
      create(statefulSet(db), `Database ${db.name} wants ${db.spec.replicas} replicas of ${image(db.spec.version)}: it creates StatefulSet ${db.name}`);
      changes.push({ write: { op: 'update', object: { ...db, status: { phase: 'Creating', ready: 0, version: db.spec.version } } }, event: say(`Database ${db.name} is Creating`, []) });
      continue;
    }
    let next = set;
    if (set.replicas !== db.spec.replicas) {
      next = { ...next, replicas: db.spec.replicas };
      changes.push({ write: { op: 'update', object: next }, event: say(`Database ${db.name} wants ${db.spec.replicas} replicas, StatefulSet ${set.name} has ${set.replicas}: it sets it back to ${db.spec.replicas}`, [set.name]) });
    }
    let backingUp = false;
    const wanted = image(db.spec.version);
    if (set.template.image !== wanted) {
      const job = store.get('Job', `${db.name}-backup-${db.spec.version}`);
      if (db.spec.backup && job?.status.condition !== 'Complete') {
        backingUp = true;
        if (!job) create(backupJob(db, set.template.image), `Database ${db.name} moves to ${wanted}: it backs the data up first with Job ${db.name}-backup-${db.spec.version}`);
      } else {
        next = withImage(next, wanted);
        changes.push({ write: { op: 'update', object: next }, event: say(`${db.spec.backup ? 'the backup is Complete, so it' : 'it'} upgrades StatefulSet ${set.name} to ${wanted}`, [set.name]) });
      }
    }
    // Status: phase and version change rarely, so they are written (and told) only when they change.
    const pods = store.list('Pod').filter((p) => p.owner === set.name && p.ownerKind === 'StatefulSet');
    const ready = pods.filter((p) => p.phase === 'Running' && p.ready).length;
    const upgrading = next.template.image !== set.template.image || pods.some((p) => p.image !== next.template.image);
    const phase = backingUp ? 'BackingUp' : upgrading ? 'Upgrading' : ready < db.spec.replicas ? 'Creating' : 'Ready';
    const version = phase === 'Ready' ? db.spec.version : (db.status?.version ?? db.spec.version);
    if (db.status?.phase !== phase || db.status.version !== version) {
      changes.push({ write: { op: 'update', object: { ...db, status: { phase, ready, version } } }, event: say(`Database ${db.name} is ${phase} (${ready} of ${db.spec.replicas} ready, v${version})`, []) });
    }
  }
  return changes;
};
