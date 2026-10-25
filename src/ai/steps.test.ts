import { describe, expect, it } from 'vitest';
import { tokenId, VOCAB } from './corpus';
import { distributionView, fmt, matrixGrid, readPrompt, vectorGrid } from './steps';

describe('readPrompt', () => {
  it('lowercases and allows extra spaces', () => {
    expect(readPrompt({ p: 'The  cat ' }, 'p', 'Prompt')).toEqual({ ok: true, value: [tokenId('the'), tokenId('cat')] });
  });

  it('refuses an unknown word, naming it and listing the known ones', () => {
    const r = readPrompt({ p: 'the cat.' }, 'p', 'Prompt');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.why).toContain('"cat."');
      expect(r.why).toContain('mat');
    }
  });

  it.each(['', '   ', 'the cat sat on the mat the'])('refuses %j (empty, or more than 6 words)', (p) => {
    expect(readPrompt({ p }, 'p', 'Prompt').ok).toBe(false);
  });
});

describe('distributionView', () => {
  const probs = VOCAB.map((_, i) => (i + 1) / ((VOCAB.length * (VOCAB.length + 1)) / 2));

  it('shows the 12 most likely bars and one "others" bar', () => {
    const view = distributionView(probs);
    expect(view.bars).toHaveLength(13);
    expect(view.bars.at(-1)!.id).toBe('others');
    expect(view.bars[0]!.label).toBe(VOCAB.at(-1));
    expect(view.bars.reduce((s, b) => s + b.value, 0)).toBeCloseTo(1, 12);
  });

  it('puts kept bars first and marks the cut', () => {
    const cut = new Set(VOCAB.map((_, i) => i).slice(0, 30));
    const view = distributionView(probs, { cut, chosen: VOCAB.length - 1 });
    expect(view.cutoff).toBe(4);
    expect(view.bars[0]!.role).toBe('found');
    expect(view.bars.slice(4, 12).every((b) => b.role === 'discarded')).toBe(true);
  });

  it('always shows the target bar, even when it is not among the 12 most likely', () => {
    const uniform = VOCAB.map(() => 1 / VOCAB.length);
    const view = distributionView(uniform, { target: VOCAB.length - 1 });
    expect(view.bars).toHaveLength(13);
    expect(view.bars[view.target!]!.label).toBe(VOCAB.at(-1));
    expect(view.bars.reduce((s, b) => s + b.value, 0)).toBeCloseTo(1, 12);
  });

  it('points at the target bar', () => {
    expect(distributionView(probs, { target: VOCAB.length - 2 }).target).toBe(1);
  });
});

describe('formatting and grids', () => {
  it('rounds to 2 decimals without a negative zero', () => {
    expect(fmt(-0.001)).toBe('0.00');
    expect(fmt(0.456)).toBe('0.46');
    expect(fmt(-Infinity)).toBe('−∞');
  });

  it('draws vectors as columns, heat by size', () => {
    const view = vectorGrid([{ label: 'cat', values: [1, -2, 0, 0, 0, 0, 0, 0] }], 'v');
    expect(view.rows).toHaveLength(8);
    expect(view.colLabels).toEqual(['cat']);
    expect(view.rows[1]!.cells[0]).toMatchObject({ value: '-2.00', heat: 1 });
    expect(view.rows[0]!.cells[0]!.heat).toBe(0.5);
  });

  it('shows -Infinity as −∞ with no heat', () => {
    const view = matrixGrid([[1, -Infinity]], ['a'], ['a', 'b'], 'm', 'abs');
    expect(view.rows[0]!.cells[1]).toMatchObject({ value: '−∞', heat: 0 });
    expect(view.rows[0]!.cells[0]!.heat).toBe(1);
  });
});
