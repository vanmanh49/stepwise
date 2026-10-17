import { describe, expect, it } from 'vitest';
import type { CallFrame } from '../../../types/visualization';
import { layoutCalls } from './callsLayout';

const frame = (id: string, parent?: string): CallFrame => ({ id, label: id, role: 'default', ...(parent && { parent }) });

describe('layoutCalls', () => {
  it('places leaves in call order and parents over their children', () => {
    const at = new Map(
      layoutCalls([frame('f3'), frame('f2', 'f3'), frame('f1a', 'f2'), frame('f0', 'f2'), frame('f1b', 'f3')]).map((p) => [p.id, p]),
    );
    expect(at.get('f3')!.y).toBe(0);
    expect(at.get('f2')!.y).toBe(1);
    expect(at.get('f1a')!.y).toBe(2);
    expect([at.get('f1a')!.x, at.get('f0')!.x, at.get('f1b')!.x]).toEqual([0, 1, 2]);
    expect(at.get('f2')!.x).toBe(0.5);
    expect(at.get('f3')!.x).toBe(1.25);
  });

  it('centres a parent with three children over the middle child', () => {
    const at = new Map(layoutCalls([frame('r'), frame('a', 'r'), frame('b', 'r'), frame('c', 'r')]).map((p) => [p.id, p]));
    expect(at.get('r')!.x).toBe(at.get('b')!.x);
  });

  it('never puts two frames in the same spot', () => {
    let seed = 7;
    const frames = [frame('n0')];
    for (let i = 1; i < 15; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      frames.push(frame(`n${i}`, `n${seed % i}`));
    }
    const spots = layoutCalls(frames).map((p) => `${p.x},${p.y}`);
    expect(spots).toHaveLength(15);
    expect(new Set(spots).size).toBe(15);
  });

  it('lays out frames with a missing parent as extra roots', () => {
    const layout = layoutCalls([frame('a'), frame('b', 'zzz')]);
    expect(layout.map((p) => p.y)).toEqual([0, 0]);
  });
});
