import { describe, expect, it } from 'vitest';
import { ctxFor, node, pod, storeWith } from '../fixtures.testutil';
import type { Breakdown, Pod } from '../model';
import { schedule } from './scheduler';

const pending = (name: string, extra: Partial<Pod> = {}) => pod(name, { phase: 'Pending', ready: false, ...extra });
const placed = (changes: ReturnType<typeof schedule>) => changes.map((c) => [c.write!.object.name, (c.write!.object as Pod).node]);

describe('scheduler filters', () => {
  it('rejects cordoned, tainted, unmatched and full nodes with Kubernetes reasons, grouped and counted', () => {
    const store = storeWith(
      node('node-1', { unschedulable: true }),
      node('node-2', { taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }] }),
      node('node-3', { cpu: 1 }),
      node('node-4', { cpu: 1 }),
      node('node-5', { ready: false }),
      pending('p', { cpu: 2 }),
    );
    const [change] = schedule(ctxFor(store));
    expect(change!.event.kind).toBe('unschedulable');
    expect(change!.event.reason).toBe(
      '0/5 nodes are available: 1 node(s) were not ready, 1 node(s) were unschedulable, 1 node(s) had untolerated taint {gpu: true}, 2 Insufficient cpu',
    );
    expect(change!.event.breakdown!.rows.map((r) => [r.node, r.filtered])).toEqual([
      ['node-1', 'node(s) were unschedulable'],
      ['node-2', 'node(s) had untolerated taint {gpu: true}'],
      ['node-3', 'Insufficient cpu'],
      ['node-4', 'Insufficient cpu'],
      ['node-5', 'node(s) were not ready'],
    ]);
  });

  it('keeps BestEffort pods off a node under memory pressure, but not pods that request memory', () => {
    const store = storeWith(node('node-1', { memoryPressure: true }), pending('be', { createdAt: 1, resources: {} }), pending('bu', { createdAt: 2, resources: { memory: { request: 64 } } }));
    const changes = schedule(ctxFor(store));
    expect(changes.map((c) => [c.event.kind, c.event.subjects[0]])).toEqual([
      ['unschedulable', 'be'],
      ['bind', 'bu'],
    ]);
    expect(changes[0]!.event.reason).toBe('0/1 nodes are available: 1 node(s) had memory pressure');
  });

  it('lets a toleration through a NoSchedule taint', () => {
    const store = storeWith(node('node-1', { taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }] }), pending('p', { tolerations: [{ key: 'gpu', operator: 'Exists' }] }));
    expect(placed(schedule(ctxFor(store)))).toEqual([['p', 'node-1']]);
  });

  it('checks memory as well as CPU', () => {
    const store = storeWith(node('node-1', { memory: 512 }), pending('p', { resources: { memory: { request: 1024 } } }));
    expect(schedule(ctxFor(store))[0]!.event.reason).toBe('0/1 nodes are available: 1 Insufficient memory');
  });

  it('applies required node affinity', () => {
    const store = storeWith(
      node('node-1', { labels: { disk: 'hdd' } }),
      node('node-2', { labels: { disk: 'ssd' } }),
      pending('p', { affinity: { node: { required: [{ key: 'disk', op: '=', values: ['ssd'] }] } } }),
    );
    const [change] = schedule(ctxFor(store));
    expect(placed([change!])).toEqual([['p', 'node-2']]);
    expect(change!.event.breakdown!.rows[0]).toEqual({ node: 'node-1', filtered: "node(s) didn't match Pod's node affinity/selector" });
  });

  it('keeps required anti-affinity pods apart, counting pods placed in the same pass', () => {
    const anti = { podAnti: { required: { selector: [{ key: 'app', op: '=' as const, values: ['web'] }], topologyKey: 'kubernetes.io/hostname' as const } } };
    const store = storeWith(node('node-1'), node('node-2'), pending('a', { affinity: anti, createdAt: 1 }), pending('b', { affinity: anti, createdAt: 2 }), pending('c', { affinity: anti, createdAt: 3 }));
    const changes = schedule(ctxFor(store));
    expect(placed(changes.filter((c) => c.event.kind === 'bind'))).toEqual([
      ['a', 'node-1'],
      ['b', 'node-2'],
    ]);
    expect(changes.at(-1)!.event.reason).toBe("0/2 nodes are available: 2 node(s) didn't match pod anti-affinity rules");
  });
});

describe('scheduler scores', () => {
  const store = () => storeWith(node('node-1'), node('node-2'), pod('x', { node: 'node-1', cpu: 2 }), pending('p'));

  it('spreads with LeastAllocated and packs with MostAllocated', () => {
    expect(placed(schedule(ctxFor(store()))) ).toEqual([['p', 'node-2']]);
    expect(placed(schedule({ ...ctxFor(store()), strategy: 'MostAllocated' }))).toEqual([['p', 'node-1']]);
  });

  it('records each node\'s scores and the winner', () => {
    const breakdown = schedule(ctxFor(store()))[0]!.event.breakdown as Breakdown;
    expect(breakdown.pod).toBe('p');
    // node-1: CPU 1 of 4 free after placing → 25; memory untouched → 100; mean 63 (rounded).
    expect(breakdown.rows).toEqual([
      { node: 'node-1', scores: { NodeResourcesFit: 63 }, total: 63 },
      { node: 'node-2', scores: { NodeResourcesFit: 88 }, total: 88, chosen: true },
    ]);
  });

  it('adds preferred node affinity to the score', () => {
    const s = storeWith(
      node('node-1', { labels: { disk: 'ssd' } }),
      node('node-2'),
      pod('x', { node: 'node-1' }),
      pending('p', { affinity: { node: { preferred: [{ weight: 50, selector: [{ key: 'disk', op: '=', values: ['ssd'] }] }] } } }),
    );
    const [change] = schedule(ctxFor(s));
    expect(placed([change!])).toEqual([['p', 'node-1']]);
    expect(change!.event.breakdown!.rows[0]!.scores).toEqual({ NodeResourcesFit: 75, NodeAffinity: 100 });
  });

  it('prefers nodes with fewer matching pods for preferred anti-affinity, by zone', () => {
    const term = { selector: [{ key: 'app', op: '=' as const, values: ['web'] }], topologyKey: 'zone' as const };
    const s = storeWith(
      node('node-1', { labels: { zone: 'a' } }),
      node('node-2', { labels: { zone: 'a' } }),
      node('node-3', { cpu: 2, labels: { zone: 'b' } }),
      pod('w1', { node: 'node-1' }),
      pending('p', { affinity: { podAnti: { preferred: [{ weight: 100, term }] } } }),
    );
    expect(placed(schedule(ctxFor(s)))).toEqual([['p', 'node-3']]);
  });

  it('scores PreferNoSchedule taints down without filtering', () => {
    const s = storeWith(node('node-1', { taints: [{ key: 'spot', value: 'yes', effect: 'PreferNoSchedule' }] }), node('node-2'), pod('x', { node: 'node-2' }), pending('p'));
    const [change] = schedule(ctxFor(s));
    expect(placed([change!])).toEqual([['p', 'node-2']]);
    expect(change!.event.breakdown!.rows[0]!.scores).toMatchObject({ TaintToleration: 50 });
  });
});
