import { describe, expect, it } from 'vitest';
import type { Requirement } from './model';
import { explainMatch, formatSelector, matches } from './selector';

const pod = { app: 'web', tier: 'fe', env: 'prod' };

describe('selectors', () => {
  it('matches each operator', () => {
    expect(matches([{ key: 'app', op: '=', values: ['web'] }], pod)).toBe(true);
    expect(matches([{ key: 'env', op: '!=', values: ['prod'] }], pod)).toBe(false);
    expect(matches([{ key: 'tier', op: 'in', values: ['fe', 'be'] }], pod)).toBe(true);
    expect(matches([{ key: 'tier', op: 'notin', values: ['fe'] }], pod)).toBe(false);
    expect(matches([{ key: 'track', op: 'exists', values: [] }], pod)).toBe(false);
    expect(matches([{ key: 'app', op: 'exists', values: [] }], pod)).toBe(true);
    // A missing key is "not equal" and "not in".
    expect(matches([{ key: 'track', op: '!=', values: ['x'] }], pod)).toBe(true);
    expect(matches([{ key: 'track', op: 'notin', values: ['x'] }], pod)).toBe(true);
  });

  it('needs every requirement to hold', () => {
    expect(matches([{ key: 'app', op: '=', values: ['web'] }, { key: 'tier', op: '=', values: ['be'] }], pod)).toBe(false);
  });

  it('names the requirement that decided', () => {
    const app: Requirement = { key: 'app', op: '=', values: ['web'] };
    expect(explainMatch([app, { key: 'env', op: '!=', values: ['prod'] }], pod)).toEqual({ ok: false, requirement: 'env!=prod' });
    expect(explainMatch([app], pod)).toEqual({ ok: true, requirement: 'app=web' });
  });

  it('formats selectors', () => {
    expect(
      formatSelector([
        { key: 'tier', op: 'in', values: ['fe', 'be'] },
        { key: 'track', op: 'exists', values: [] },
      ]),
    ).toBe('tier in (fe,be), track');
    expect(formatSelector([{ key: 'tier', op: 'notin', values: ['fe'] }])).toBe('tier notin (fe)');
  });
});
