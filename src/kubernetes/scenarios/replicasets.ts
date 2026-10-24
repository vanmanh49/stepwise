import { readChoice, readInt, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario } from '../model';
import { nodes, replicaSet, scenarioSteps } from './shared';

export const replicaSetsCode = `// ReplicaSet controller
function reconcile(rs) {
  const pods = podsOwnedBy(rs)          // Lost pods still count
  for (let i = pods.length; i < rs.replicas; i++)
    createPod(rs.template)
  const surplus = pods.length - rs.replicas
  pods.sort(unscheduledFirst, notReadyNext, newestNext)
    .slice(0, surplus).forEach(deletePod)
}

// node lifecycle, every 5 s
if (now - node.lastHeartbeat > grace) markNotReady(node)
deleteLostPodsLater(node)               // 10 s here, 5 min by default`;

export const NODE_DOWN = ['off', 'on'];
const CHANGE_AT = 20;

export function replicaSetsScenario(values: Record<string, string>): Read<Scenario> {
  const replicas = readInt(values, 'replicas', 'Replicas', { min: 1, max: 6 });
  if (!replicas.ok) return replicas;
  const scaleTo = readInt(values, 'scaleTo', 'Scale to', { min: 0, max: 6 });
  if (!scaleTo.ok) return scaleTo;
  const nodeDown = readChoice(values, 'nodeDown', 'node-2 dies', NODE_DOWN);
  if (!nodeDown.ok) return nodeDown;
  const down = nodeDown.value === 'on';
  return {
    ok: true,
    value: {
      nodes: nodes(3),
      actions: [
        { at: 0, kind: 'apply', object: replicaSet('web', replicas.value) },
        ...(down ? [] : [{ at: CHANGE_AT, kind: 'scale' as const, target: 'web', replicas: scaleTo.value }]),
      ],
      faults: down ? [{ kind: 'node-down', node: 'node-2', at: CHANGE_AT }] : [],
    },
  };
}

export function replicaSetsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(replicaSetsScenario(values), "Can't run this ReplicaSet", {
    code: replicaSetsCode,
    focus: 'web',
    lines: { 'create-pod': 'createPod(', 'delete-pod': 'forEach(deletePod)', 'node-not-ready': 'markNotReady', lost: 'markNotReady', action: 'function reconcile', fault: 'node.lastHeartbeat > grace' },
    explain: (event) => {
      if (event.kind === 'delete-pod' && event.text.startsWith('node lifecycle')) {
        return { line: 'deleteLostPodsLater', why: 'The node has been NotReady long enough, so its pods are deleted. Only now does the ReplicaSet see fewer pods than it wants.' };
      }
      if (event.kind === 'delete-pod') return { why: 'There are more pods than replicas. The ReplicaSet removes pods that aren\'t scheduled first, then ones that aren\'t ready, then the newest. These are all the same age, so the lowest names go.' };
      if (event.kind === 'create-pod') return { why: 'The ReplicaSet counts the pods it owns and creates the missing ones from its pod template.' };
      if (event.kind === 'fault') return { why: 'node-2 stops, but nothing in the control plane knows yet: it only notices when the heartbeats have been missing for longer than the grace period.' };
      if (event.kind === 'lost') return { why: 'The pods on a NotReady node can\'t be reached. They still count for the ReplicaSet until they are deleted, so no replacement starts yet.' };
      return undefined;
    },
  });
}
