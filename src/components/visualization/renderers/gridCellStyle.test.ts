import { describe, expect, it } from 'vitest';
import type { Role } from '../../../types/visualization';
import { ROLE_META } from '../roles';
import { gridCellStyle } from './gridCellStyle';

describe('gridCellStyle', () => {
  // Motion keeps the last animated value of a style key that disappears, so a ring
  // from an earlier "current" step would stick unless every role sets boxShadow.
  it.each(Object.keys(ROLE_META) as Role[])('always sets boxShadow for %s', (role) => {
    expect(gridCellStyle(role).boxShadow).toBeDefined();
  });

  it('draws a ring only for ring roles', () => {
    expect(gridCellStyle('default').boxShadow).toBe('none');
    expect(gridCellStyle('active').boxShadow).not.toBe('none');
  });
});
