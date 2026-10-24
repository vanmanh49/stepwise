import { describe, expect, it } from 'vitest';
import { ctxFor, node, pod, replicaSet, storeWith } from '../fixtures.testutil';
import { reconcileEndpoints } from './endpoints';
import { reconcileReplicaSets } from './replicaset';
import { schedule } from './scheduler';

const owned = (name: string, extra = {}) => pod(name, { owner: 'web-7f', node: 'node-1', ...extra });

describe('ReplicaSet controller', () => {
  it('creates the shortfall', () => {
    const changes = reconcileReplicaSets(ctxFor(storeWith(replicaSet('web-7f', 3), owned('web-7f-aaa'))));
    expect(changes.map((c) => c.event.kind)).toEqual(['create-pod', 'create-pod']);
    const names = changes.map((c) => c.write!.object.name);
    expect(names.every((n) => /^web-7f-[a-z0-9]{3}$/.test(n))).toBe(true);
    expect(new Set([...names, 'web-7f-aaa']).size).toBe(3);
    expect(changes[0]!.write!.object).toMatchObject({ kind: 'Pod', phase: 'Pending', ready: false, restarts: 0, owner: 'web-7f', createdAt: 10, labels: { app: 'web' } });
    expect(changes[0]!.event).toMatchObject({ by: 'controllers', text: `ReplicaSet web-7f sees 1 of 3 pods and creates ${names[0]}` });
  });

  it('deletes in the stated order: unbound, then not ready, then newest', () => {
    const store = storeWith(
      replicaSet('web-7f', 1),
      owned('web-7f-aaa', { createdAt: 1 }),
      owned('web-7f-bbb', { createdAt: 5 }),
      owned('web-7f-ccc', { ready: false, phase: 'ContainerCreating' }),
      owned('web-7f-ddd', { node: undefined, phase: 'Pending', ready: false }),
    );
    const changes = reconcileReplicaSets(ctxFor(store));
    expect(changes.map((c) => [c.event.kind, c.write?.op, c.write?.object.name])).toEqual([
      ['delete-pod', 'delete', 'web-7f-ddd'],
      ['delete-pod', 'delete', 'web-7f-ccc'],
      ['delete-pod', 'delete', 'web-7f-bbb'],
    ]);
  });

  it('notes a reconcile with nothing to do', () => {
    const changes = reconcileReplicaSets(ctxFor(storeWith(replicaSet('web-7f', 1), owned('web-7f-aaa'))));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.write).toBeUndefined();
    expect(changes[0]!.event).toMatchObject({ kind: 'reconcile', text: 'ReplicaSet web-7f sees 1 of 1 pods: nothing to do' });
  });

  it('counts Lost pods until they are deleted', () => {
    const changes = reconcileReplicaSets(ctxFor(storeWith(replicaSet('web-7f', 2), owned('web-7f-aaa'), owned('web-7f-bbb', { phase: 'Lost', ready: false }))));
    expect(changes.map((c) => c.event.kind)).toEqual(['reconcile']);
  });

  it('deletes surplus pods before creating any, across ReplicaSets, so pods never exceed what the sets ask for', () => {
    const store = storeWith(
      replicaSet('web-aa', 2),
      replicaSet('web-zz', 0),
      pod('web-aa-one', { owner: 'web-aa', node: 'node-1' }),
      pod('web-zz-one', { owner: 'web-zz', node: 'node-1' }),
    );
    expect(reconcileReplicaSets(ctxFor(store)).map((c) => c.event.kind)).toEqual(['delete-pod', 'create-pod']);
  });

  it('copies resources, tolerations, affinity and probes from the template', () => {
    const extras = {
      resources: { cpu: { request: 250, limit: 500 } },
      tolerations: [{ key: 'gpu', operator: 'Exists' as const }],
      affinity: { node: { required: [{ key: 'disk', op: '=' as const, values: ['ssd'] }] } },
      probes: { liveness: { periodS: 2, failureThreshold: 3 } },
    };
    const [change] = reconcileReplicaSets(ctxFor(storeWith(replicaSet('web-7f', 1, { template: { ...replicaSet('x', 0).template, ...extras } }))));
    expect(change!.write!.object).toMatchObject(extras);
  });

  it("ignores other owners' pods", () => {
    const changes = reconcileReplicaSets(ctxFor(storeWith(replicaSet('web-7f', 1), pod('web-9c-aaa', { owner: 'web-9c' }))));
    expect(changes.map((c) => c.event.kind)).toEqual(['create-pod']);
  });
});

describe('scheduler', () => {
  const pending = (name: string, extra = {}) => pod(name, { phase: 'Pending', ready: false, ...extra });

  it('binds to the node with the most free CPU, ties to the lowest name', () => {
    const store = storeWith(node('node-1'), node('node-2'), node('node-3'), pod('a', { node: 'node-1' }), pending('p'));
    const [change] = schedule(ctxFor(store));
    expect(change!.write!.object).toMatchObject({ name: 'p', node: 'node-2' });
    expect(change!.event).toMatchObject({ kind: 'bind', by: 'scheduler', node: 'node-2', text: 'scheduler binds p to node-2 (4 of 4 CPU free)' });
  });

  it('places the oldest pending pod first and counts what it just placed', () => {
    const store = storeWith(node('node-1', { cpu: 1 }), node('node-2', { cpu: 1 }), pending('b', { createdAt: 1 }), pending('a', { createdAt: 2 }));
    expect(schedule(ctxFor(store)).map((c) => [c.write!.object.name, (c.write!.object as { node?: string }).node])).toEqual([
      ['b', 'node-1'],
      ['a', 'node-2'],
    ]);
  });

  it('skips NotReady nodes and nodes without room', () => {
    const store = storeWith(node('node-1', { ready: false }), node('node-2', { cpu: 2 }), pod('x', { node: 'node-2', cpu: 2 }), node('node-3'), pending('p'));
    expect(schedule(ctxFor(store))[0]!.write!.object).toMatchObject({ node: 'node-3' });
  });

  it("doesn't count finished pods against a node", () => {
    const store = storeWith(node('node-1', { cpu: 1 }), pod('x', { node: 'node-1', phase: 'Completed', ready: false }), pending('p'));
    expect(schedule(ctxFor(store))[0]!.write!.object).toMatchObject({ node: 'node-1' });
  });

  it('leaves a pod Pending with the reason, and does not rewrite the same reason', () => {
    const store = storeWith(node('node-1', { cpu: 1 }), node('node-2', { cpu: 1 }), pod('x', { node: 'node-1' }), pod('y', { node: 'node-2' }), pending('p'));
    const changes = schedule(ctxFor(store));
    expect(changes.map((c) => c.event.kind)).toEqual(['unschedulable']);
    expect(changes[0]!.write!.object).toMatchObject({ name: 'p', reason: '0/2 nodes are available: 2 Insufficient cpu' });
    store.write(changes[0]!.write!);
    expect(schedule(ctxFor(store))).toEqual([]);
  });

  it('says when no node is Ready', () => {
    const store = storeWith(node('node-1', { ready: false }), pending('p'));
    expect(schedule(ctxFor(store))[0]!.write!.object).toMatchObject({ reason: '0/1 nodes are available: 1 node(s) were not ready' });
  });
});

describe('Endpoints controller', () => {
  const service = { kind: 'Service' as const, name: 'web', selector: [{ key: 'app', op: '=' as const, values: ['web'] }] };

  it('lists only ready matching pods', () => {
    const store = storeWith(service, pod('web-b'), pod('web-a'), pod('web-c', { ready: false }), pod('api-a', { labels: { app: 'api' } }));
    const changes = reconcileEndpoints(ctxFor(store));
    expect(changes.map((c) => [c.event.kind, c.write!.op, c.write!.object])).toEqual([['endpoints', 'create', { kind: 'Endpoints', name: 'web', pods: ['web-a', 'web-b'] }]]);
    expect(changes[0]!.event.text).toBe('Endpoints web: web-a, web-b');
  });

  it('writes Endpoints only when the list changes', () => {
    const store = storeWith(service, pod('web-a'));
    for (const change of reconcileEndpoints(ctxFor(store))) store.write(change.write!);
    expect(reconcileEndpoints(ctxFor(store))).toEqual([]);
    store.write({ op: 'update', object: pod('web-a', { ready: false }) });
    const [change] = reconcileEndpoints(ctxFor(store));
    expect(change!.write).toEqual({ op: 'update', object: { kind: 'Endpoints', name: 'web', pods: [] } });
    expect(change!.event.text).toBe('Endpoints web: no ready pods');
  });
});
