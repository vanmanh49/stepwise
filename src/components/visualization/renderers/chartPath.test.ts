import { describe, expect, it } from 'vitest';
import { sparkPath } from './chartPath';

describe('sparkPath', () => {
  it('runs from bottom left to top right, 1 px inside the box', () => {
    expect(sparkPath([0, 1], 100, 10, 1)).toBe('M0.0,9.0 L100.0,1.0');
  });

  it('draws one point without dividing by zero', () => {
    expect(sparkPath([1], 100, 10, 1)).toBe('M0.0,1.0');
  });

  it('gives an empty path for no points', () => {
    expect(sparkPath([], 100, 10, 1)).toBe('');
  });

  it('gives no NaN when every point and the top are zero', () => {
    expect(sparkPath([0, 0], 100, 10, 0)).toBe('M0.0,9.0 L100.0,9.0');
  });
});
