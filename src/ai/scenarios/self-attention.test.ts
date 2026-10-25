import { describe, expect, it } from 'vitest';
import type { GridView } from '../../types/visualization';
import { tokenId } from '../corpus';
import { forward } from '../model';
import { fmt } from '../steps';
import { selfAttentionSteps } from './self-attention';

const grid = (title: string, prompt = 'the cat sat on the') => selfAttentionSteps({ prompt }).find((s) => s.title.startsWith(title))!.view as GridView;
const cells = (view: GridView) => view.rows.map((r) => r.cells.map((c) => String(c!.value)));

describe('self-attention lesson', () => {
  it('masks every score above the diagonal', () => {
    cells(grid('Mask')).forEach((row, i) => row.forEach((v, j) => expect(v === '−∞').toBe(j > i)));
  });

  it('shows the model\'s own attention weights, each row adding up to 1', () => {
    const shown = cells(grid('softmax'));
    const { weights } = forward('the cat sat on the'.split(' ').map((w) => tokenId(w)!));
    expect(shown).toEqual(weights.map((row) => row.map(fmt)));
    for (const row of weights) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('gives a one-word prompt a single weight of 1.00', () => {
    expect(cells(grid('softmax', 'cat'))).toEqual([['1.00']]);
  });
});
