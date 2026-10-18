import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { datasets } from '../../../sql/datasets';
import { viewAt } from '../../../sql/steps';
import { ClauseStrip } from './TableRenderer';

describe('ClauseStrip', () => {
  it('gives every clause a unique key when a clause repeats, as in a UNION', () => {
    const view = viewAt(datasets.shop, 'SELECT id FROM orders\nUNION\nSELECT id FROM customers\nORDER BY id;', 1);
    expect(view.clauses.filter((c) => c === 'SELECT')).toHaveLength(2);
    const list = ClauseStrip({ clauses: view.clauses, current: view.current }) as ReactElement<{ children: ReactElement[] }>;
    const keys = list.props.children.map((item) => item.key);
    expect(keys).toHaveLength(view.clauses.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
