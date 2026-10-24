import { describe, expect, it } from 'vitest';
import { cpuRequestM, loadAt, memoryRequestMi, qosOf, tolerates } from './model';

describe('phase 2 model helpers', () => {
  it('derives the QoS class the way Kubernetes does', () => {
    expect(qosOf(undefined)).toBe('BestEffort');
    expect(qosOf({})).toBe('BestEffort');
    expect(qosOf({ cpu: { request: 500 } })).toBe('Burstable');
    expect(qosOf({ cpu: { request: 500, limit: 1000 }, memory: { request: 256, limit: 256 } })).toBe('Burstable');
    expect(qosOf({ cpu: { request: 500, limit: 500 }, memory: { request: 256, limit: 256 } })).toBe('Guaranteed');
    // Limits alone set requests to the same values.
    expect(qosOf({ cpu: { limit: 500 }, memory: { limit: 256 } })).toBe('Guaranteed');
  });

  it('matches tolerations to taints', () => {
    const gpu = { key: 'gpu', value: 'true', effect: 'NoSchedule' as const };
    expect(tolerates(undefined, gpu)).toBe(false);
    expect(tolerates([{ key: 'gpu', operator: 'Exists' }], gpu)).toBe(true);
    expect(tolerates([{ key: 'gpu', operator: 'Equal', value: 'true' }], gpu)).toBe(true);
    expect(tolerates([{ key: 'gpu', operator: 'Equal', value: 'false' }], gpu)).toBe(false);
    expect(tolerates([{ key: 'gpu', operator: 'Exists', effect: 'NoExecute' }], gpu)).toBe(false);
    expect(tolerates([{ key: 'gpu', operator: 'Exists', effect: 'NoSchedule' }], gpu)).toBe(true);
  });

  it('interpolates the traffic curve and holds it outside the points', () => {
    const points: [number, number][] = [
      [0, 20],
      [30, 120],
    ];
    expect(loadAt(points, 15)).toBe(70);
    expect(loadAt(points, 60)).toBe(120);
    expect(loadAt(points, -1)).toBe(20);
    expect(loadAt([], 5)).toBe(0);
  });

  it('reads CPU in millicores, falling back to phase 1 cores', () => {
    expect(cpuRequestM({ cpu: 1 })).toBe(1000);
    expect(cpuRequestM({ cpu: 1, resources: { cpu: { request: 250 } } })).toBe(250);
    expect(cpuRequestM({ cpu: 1, resources: { cpu: { limit: 400 } } })).toBe(400);
    expect(memoryRequestMi({})).toBe(0);
    expect(memoryRequestMi({ resources: { memory: { limit: 128 } } })).toBe(128);
  });
});
