import { describe, expect, it } from 'vitest';
import { deploymentOf, template } from '../fixtures.testutil';
import type { Action, DaemonSet, Fault, Frame, Scenario } from '../model';
import { simulate } from '../sim';

const agent = (extra: Partial<DaemonSet> = {}): DaemonSet => ({
  kind: 'DaemonSet',
  name: 'log-agent',
  selector: [{ key: 'app', op: '=', values: ['log-agent'] }],
  template: template('log-agent', 'agent:v1'),
  revision: 1,
  history: [],
  ...extra,
});
const tolerant = () => agent({ template: { ...template('log-agent', 'agent:v1'), tolerations: [{ key: 'gpu', operator: 'Exists', effect: 'NoSchedule' }] } });

const nodes: Scenario['nodes'] = [
  { name: 'node-1', cpu: 4, labels: { disk: 'ssd' } },
  { name: 'node-2', cpu: 4, labels: { disk: 'hdd' } },
  { name: 'node-3', cpu: 4, labels: { disk: 'ssd' }, taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }] },
];
const run = (ds: DaemonSet, actions: Action[] = [], faults: Fault[] = [], until = 100) => simulate({ nodes, actions: [{ at: 0, kind: 'apply', object: ds }, ...actions], faults, until, runToEnd: true });
const agentsOn = (state: Frame['state']) => state.pods.filter((p) => p.ownerKind === 'DaemonSet').map((p) => p.node).toSorted();

describe('DaemonSet controller', () => {
  it('runs one pod on every node it tolerates', () => {
    expect(agentsOn(run(agent()).final!)).toEqual(['node-1', 'node-2']);
    expect(agentsOn(run(tolerant()).final!)).toEqual(['node-1', 'node-2', 'node-3']);
  });

  it('adds a pod to a node that joins', () => {
    const { frames, final } = run(agent(), [{ at: 30, kind: 'add-node', node: { name: 'node-4', cpu: 4 } }]);
    expect(agentsOn(final!)).toEqual(['node-1', 'node-2', 'node-4']);
    const created = frames.find((f) => f.event.kind === 'create-pod' && f.event.t > 30)!;
    expect(created.event.t).toBe(31);
  });

  it('only uses nodes matching its nodeSelector', () => {
    expect(agentsOn(run(agent({ nodeSelector: { disk: 'ssd' } })).final!)).toEqual(['node-1']);
  });

  it('still runs on a cordoned node', () => {
    expect(agentsOn(run(agent(), [{ at: 0, kind: 'cordon', node: 'node-1' }]).final!)).toEqual(['node-1', 'node-2']);
  });

  it('is left in place by a drain, which evicts the other pods', () => {
    const { final } = run(agent(), [{ at: 0, kind: 'apply', object: deploymentOf('web', 2) }, { at: 50, kind: 'drain', node: 'node-1' }]);
    expect(agentsOn(final!)).toEqual(['node-1', 'node-2']);
    expect(final!.pods.filter((p) => p.ownerKind !== 'DaemonSet' && p.node === 'node-1')).toEqual([]);
  });

  it('is not marked Lost when its node goes NotReady', () => {
    const { final } = run(agent(), [], [{ kind: 'node-down', node: 'node-2', at: 20 }], 120);
    expect(final!.nodes.find((n) => n.name === 'node-2')!.ready).toBe(false);
    const pod = final!.pods.find((p) => p.ownerKind === 'DaemonSet' && p.node === 'node-2')!;
    expect(pod.phase).not.toBe('Lost');
  });

  it('rolls a new image out one node at a time', () => {
    const { frames, final } = run(tolerant(), [{ at: 40, kind: 'set-image', target: 'log-agent', image: 'agent:v2' }], [], 150);
    for (const f of frames.filter((x) => x.event.t >= 40)) {
      const ready = f.state.pods.filter((p) => p.ownerKind === 'DaemonSet' && p.phase === 'Running' && p.ready).length;
      expect(ready).toBeGreaterThanOrEqual(2);
    }
    expect(final!.pods.filter((p) => p.ownerKind === 'DaemonSet').map((p) => p.image)).toEqual(['agent:v2', 'agent:v2', 'agent:v2']);
  });
});
