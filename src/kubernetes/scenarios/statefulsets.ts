import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, Fault, Scenario, StatefulSet } from '../model';
import { appSelector, appTemplate, scenarioSteps, service } from './shared';

export const statefulsetsCode = `// StatefulSet controller, on every change
for (let i = 0; i < replicas; i++)
  if (!exists(\`db-\${i}\`)) {
    createClaim(\`data-db-\${i}\`)            // kept even when the pod goes
    createPod(\`db-\${i}\`)                   // same name every time
    if (ordered) break                       // OrderedReady: one at a time
  } else if (ordered && !ready(\`db-\${i}\`)) break  // wait for it
// scale down: the highest ordinal first, one at a time
// update: replace the highest outdated pod once all are ready`;

export const POLICIES = ['OrderedReady', 'Parallel'];
export const EVENTS = ['none', 'delete db-1', 'scale to 1 and back', 'set image v2'];
export const STUCK = ['off', 'on'];
const EVENT_AT = 80;

export function statefulsetsScenario(values: Record<string, string>): Read<Scenario> {
  const policy = readChoice(values, 'policy', 'podManagementPolicy', POLICIES);
  if (!policy.ok) return policy;
  const replicas = readInt(values, 'replicas', 'Replicas', { min: 1, max: 5 });
  if (!replicas.ok) return replicas;
  const event = readChoice(values, 'event', 'At 80 s', EVENTS);
  if (!event.ok) return event;
  const stuck = readChoice(values, 'stuck', 'db-1 never ready', STUCK);
  if (!stuck.ok) return stuck;
  const set: StatefulSet = {
    kind: 'StatefulSet',
    name: 'db',
    replicas: replicas.value,
    selector: appSelector('db'),
    template: appTemplate('db', 'postgres:15'),
    serviceName: 'db',
    podManagementPolicy: policy.value as StatefulSet['podManagementPolicy'],
    claims: [{ name: 'data', requestGi: 1, storageClass: 'standard' }],
    whenScaled: 'Retain',
    revision: 1,
    history: [],
  };
  const later: Record<string, Action[]> = {
    none: [],
    'delete db-1': [{ at: EVENT_AT, kind: 'delete', object: { kind: 'Pod', name: 'db-1' } }],
    'scale to 1 and back': [
      { at: EVENT_AT, kind: 'scale', target: 'db', replicas: 1 },
      { at: 120, kind: 'scale', target: 'db', replicas: replicas.value },
    ],
    'set image v2': [{ at: EVENT_AT, kind: 'set-image', target: 'db', image: 'postgres:16' }],
  };
  const actions: Action[] = [
    { at: 0, kind: 'apply', object: { kind: 'StorageClass', name: 'standard', reclaimPolicy: 'Delete' } },
    { at: 0, kind: 'apply', object: service('db') },
    { at: 0, kind: 'apply', object: set },
    ...later[event.value]!,
  ];
  const faults: Fault[] = stuck.value === 'on' ? [{ kind: 'crash', prefix: 'db-1', afterS: 1, exitCode: 1 }] : [];
  return { ok: true, value: { nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4 }, { name: 'node-3', cpu: 4 }], actions, faults, until: 170, runToEnd: true } };
}

export function statefulsetsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(statefulsetsScenario(values), "Can't run this StatefulSet", {
    code: statefulsetsCode,
    focus: 'db',
    lines: { 'create-claim': 'createClaim(', 'create-pod': 'createPod(', ready: '!ready(', 'delete-pod': 'scale down', provision: 'createClaim(', 'back-off': '!ready(' },
    explain: (event) => {
      if (event.kind === 'delete-pod' && event.text.includes('updates from the top')) return { line: 'update: replace', why: 'An update replaces one pod at a time, starting from the highest ordinal, and waits for each new pod to be ready. db-0, often the primary, goes last.' };
      if (event.kind === 'delete-pod') return { why: 'Scaling down removes the highest ordinal first, one pod at a time. Its PersistentVolumeClaim stays (whenScaled: Retain), so the data is still there if it scales back up.' };
      if (event.kind === 'back-off') return { line: '!ready(', why: 'db-1 keeps crashing, so it never becomes ready. With OrderedReady the controller waits for it: db-2 is never created.' };
      if (event.kind === 'action' && event.text.includes('deletes Pod db-1')) return { why: 'A StatefulSet pod has a stable identity. The controller recreates the same name, db-1, and it mounts the same claim, data-db-1, with all its data.' };
      return undefined;
    },
  });
}
