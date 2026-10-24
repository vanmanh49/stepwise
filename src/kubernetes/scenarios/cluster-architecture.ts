import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Fault, Scenario } from '../model';
import { deployment, nodes, scenarioSteps } from './shared';

export const clusterArchitectureCode = `// kubectl apply -f web.yaml
apiServer.save(deployment)          // checked, then stored in etcd

// controller manager
const rs = ensureReplicaSet(deployment)
createMissingPods(rs)               // new pods are Pending

// scheduler
for (const pod of pendingPods())
  bind(pod, nodeWithMostFreeCpu())

// kubelet on the chosen node
pullImage(pod)
startContainer(pod)
markReady(pod)`;

export const FAULTS = ['none', 'scheduler-down', 'etcd-down'];
const OUTAGE: [number, number] = [0, 30];

export function clusterArchitectureScenario(values: Record<string, string>): Read<Scenario> {
  const count = readInt(values, 'nodes', 'Nodes', { min: 1, max: 3 });
  if (!count.ok) return count;
  const replicas = readInt(values, 'replicas', 'Replicas', { min: 1, max: 3 });
  if (!replicas.ok) return replicas;
  const fault = readChoice(values, 'fault', 'Fault', FAULTS);
  if (!fault.ok) return fault;
  const faults: Fault[] = fault.value === 'none' ? [] : [{ kind: 'down', component: fault.value === 'etcd-down' ? 'etcd' : 'scheduler', from: OUTAGE[0], to: OUTAGE[1] }];
  // With etcd down, apply a moment after the outage starts, so the refusal is its own step.
  const at = fault.value === 'etcd-down' ? 2 : 0;
  return { ok: true, value: { nodes: nodes(count.value), actions: [{ at, kind: 'apply', object: deployment('web', replicas.value) }], faults } };
}

export function clusterArchitectureSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(clusterArchitectureScenario(values), "Can't run this cluster", {
    code: clusterArchitectureCode,
    focus: 'web',
    lines: {
      action: 'apiServer.save',
      'refuse-write': 'apiServer.save',
      rollout: 'ensureReplicaSet',
      'create-pod': 'createMissingPods',
      bind: 'bind(pod',
      unschedulable: 'bind(pod',
      pull: 'pullImage',
      start: 'startContainer',
      ready: 'markReady',
    },
    explain: (event) => {
      if (event.kind === 'action') return { why: 'kubectl only talks to the API server. It checks the Deployment and saves it in etcd. From here on, controllers do the work.' };
      if (event.kind === 'rollout') return { why: 'The Deployment controller watches for Deployments. This one has no ReplicaSet yet, so it creates one for its pod template.' };
      if (event.kind === 'component-down' || event.kind === 'component-up') return { line: event.by === 'etcd' ? 'apiServer.save' : 'bind(pod' };
      if (event.kind === 'create-pod') return { why: 'The ReplicaSet controller counts the pods it owns and creates the missing ones. Each starts Pending: it has no node yet.' };
      if (event.kind === 'bind') return { why: 'The scheduler only decides where a pod runs. It picks the Ready node with the most free CPU and records the choice in the API server.' };
      if (event.kind === 'pull') return { why: 'Each node runs a kubelet that watches for pods bound to its node. It pulls the image (2 s here) and then starts the container.' };
      return undefined;
    },
  });
}
