import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Scenario, Template } from '../model';
import { appTemplate, nodes, pod, scenarioSteps } from './shared';

export const podsCode = `// kubelet, for a pod bound to its node
pullImage(pod)
startContainer(pod)                  // status: Running
markReady(pod)

// kubelet, when the container exits
function onExit(pod, exitCode) {
  const restart = pod.restartPolicy === 'Always' ||
    (pod.restartPolicy === 'OnFailure' && exitCode !== 0)
  if (!restart) {
    pod.status = exitCode === 0 ? 'Completed' : 'Failed'
    return
  }
  pod.status = 'CrashLoopBackOff'
  wait(backoff)                      // 10 s, 20 s, 40 s … up to 160 s
  backoff = Math.min(backoff * 2, 160)
  restartContainer(pod)              // restarts + 1
}`;

export const POLICIES = ['Always', 'OnFailure', 'Never'];
export const EXIT_CODES = ['1', '0'];
export const CRASH_AFTER = ['5', '15'];
const UNTIL = 400;

export function podsScenario(values: Record<string, string>): Read<Scenario> {
  const policy = readChoice(values, 'policy', 'Restart policy', POLICIES);
  if (!policy.ok) return policy;
  const exit = readChoice(values, 'exit', 'Exit code', EXIT_CODES);
  if (!exit.ok) return exit;
  const after = readChoice(values, 'crashAfter', 'Exits after', CRASH_AFTER);
  if (!after.ok) return after;
  const template: Template = { ...appTemplate('web'), restartPolicy: policy.value as Template['restartPolicy'] };
  return {
    ok: true,
    value: {
      nodes: nodes(1),
      actions: [{ at: 0, kind: 'apply', object: pod('web', template) }],
      faults: [{ kind: 'crash', prefix: 'web', afterS: Number(after.value), exitCode: exit.value === '0' ? 0 : 1 }],
      until: UNTIL,
    },
  };
}

export function podsSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(podsScenario(values), "Can't run this pod", {
    code: podsCode,
    lines: { pull: 'pullImage', start: 'startContainer', ready: 'markReady', exit: 'function onExit', 'back-off': "pod.status = 'CrashLoopBackOff'", restart: 'restartContainer' },
    explain: (event, state) => {
      const web = state.pods[0];
      if (event.kind === 'action') return { why: 'A pod is the smallest thing Kubernetes runs: one or more containers that share a network address. This one has no controller, so nothing replaces it if it is deleted.' };
      if (event.kind === 'exit' && web && (web.phase === 'Completed' || web.phase === 'Failed')) {
        return {
          line: 'pod.status = exitCode === 0',
          why: web.phase === 'Completed' ? 'Exit code 0 means the program finished successfully. OnFailure only restarts on failure, so the pod is Completed and stays that way.' : 'The program failed, but the restart policy is Never, so the kubelet leaves the pod Failed.',
        };
      }
      if (event.kind === 'exit') return { why: `The container stopped. The restart policy is ${web?.restartPolicy ?? 'Always'}, so the kubelet will start it again.` };
      if (event.kind === 'restart') return { why: 'The back-off is over. The kubelet starts the same container again on the same node; the pod keeps its name and its restart count goes up.' };
      return undefined;
    },
  });
}
