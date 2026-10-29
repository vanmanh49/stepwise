import { describe, expect, it } from 'vitest';
import type { Role } from '../../../types/visualization';
import { ROLE_META } from '../roles';
import { gridCellStyle, heatStyle, isTextGrid } from './gridCellStyle';

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

describe('heatStyle', () => {
  it('keeps the normal text colour on the hottest cell, so the number stays readable', () => {
    expect(heatStyle({ id: 'a', value: '1.00', role: 'default', heat: 1 }).color).toBe('var(--text)');
  });

  it('mixes at most 60% accent into the surface', () => {
    expect(heatStyle({ id: 'a', value: '1.00', role: 'default', heat: 1 }).background).toContain('var(--accent) 60%');
  });

  it('leaves cells without heat, or with a role, alone', () => {
    expect(heatStyle({ id: 'a', value: 1, role: 'default' })).toEqual({});
    expect(heatStyle({ id: 'a', value: 1, role: 'found', heat: 1 })).toEqual({});
  });
});

describe('isTextGrid', () => {
  const grid = (value: string, arrows = false) => ({
    kind: 'grid' as const,
    rows: [{ cells: [{ id: 'a', value, role: 'default' as const }, null] }],
    ...(arrows && { arrows: [{ from: [0, 0] as [number, number], to: [0, 1] as [number, number] }] }),
  });

  it('keeps fixed square cells for short values such as numbers', () => {
    expect(isTextGrid(grid('-10.25'))).toBe(false);
  });

  it('lays out text longer than a cell as a wrapping table', () => {
    expect(isTextGrid(grid('What did the dog eat?'))).toBe(true);
  });

  it('keeps fixed cells when arrows need them', () => {
    expect(isTextGrid(grid('What did the dog eat?', true))).toBe(false);
  });
});
