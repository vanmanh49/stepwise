import { describe, expect, it } from 'vitest';
import { backoffS } from './kubelet';

describe('kubelet back-off', () => {
  it('doubles from 10 s up to the 160 s cap', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(backoffS)).toEqual([10, 20, 40, 80, 160, 160, 160]);
  });
});
