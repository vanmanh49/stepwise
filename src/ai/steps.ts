import type { Read } from '../algorithms/form';
import type { DistributionView, GridView, Role } from '../types/visualization';
import { tokenId, VOCAB } from './corpus';
import { CONTEXT } from './model';
import type { Mat, Vec } from './tensor';

export const MAX_STEPS = 200;
/** The view behind a refusal: nothing ran. */
export const EMPTY: DistributionView = { kind: 'distribution', bars: [] };
const SHOWN_BARS = 12;

/** Two decimals for the learner; no "-0.00". */
export function fmt(n: number): string {
  if (n === -Infinity) return '−∞';
  const text = n.toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}

/** A prompt of 1–max known words (CONTEXT by default), lowercased; runs of spaces are fine. */
export function readPrompt(values: Record<string, string>, name: string, label: string, max = CONTEXT): Read<number[]> {
  const words = (values[name] ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > max) {
    return { ok: false, why: max === CONTEXT ? `${label} must be 1 to ${CONTEXT} words: the model sees ${CONTEXT} tokens at a time.` : `${label} must be 1 to ${max} words.` };
  }
  const ids: number[] = [];
  for (const word of words) {
    const id = tokenId(word);
    if (id === undefined) return { ok: false, why: `"${word}" is not in this model's vocabulary. It knows: ${VOCAB.join(', ')}.` };
    ids.push(id);
  }
  return { ok: true, value: ids };
}

/** Kept ids first, then cut ones, each most likely first; at most 12 bars (the target always among them) plus one "others" bar. */
export function distributionView(probs: Vec, o: { title?: string; chosen?: number; cut?: ReadonlySet<number>; target?: number } = {}): DistributionView {
  const cut = o.cut ?? new Set<number>();
  const byProb = (a: number, b: number) => probs[b]! - probs[a]! || a - b;
  const ids = probs.map((_, i) => i);
  const order = [...ids.filter((i) => !cut.has(i)).toSorted(byProb), ...ids.filter((i) => cut.has(i)).toSorted(byProb)];
  const shown = order.slice(0, SHOWN_BARS);
  // The target always gets a bar, in place of the last one shown.
  if (o.target !== undefined && !shown.includes(o.target)) shown[SHOWN_BARS - 1] = o.target;
  const rest = order.filter((i) => !shown.includes(i));
  const role = (i: number): Role => (i === o.chosen ? 'found' : cut.has(i) ? 'discarded' : 'default');
  const bars = shown.map((i) => ({ id: VOCAB[i]!, label: VOCAB[i]!, value: probs[i]!, role: role(i) }));
  if (rest.length > 0) bars.push({ id: 'others', label: `${rest.length} others`, value: rest.reduce((s, i) => s + probs[i]!, 0), role: rest.every((i) => cut.has(i)) ? 'discarded' : 'default' });
  const target = o.target === undefined ? -1 : shown.indexOf(o.target);
  return {
    kind: 'distribution',
    bars,
    ...(o.title && { title: o.title }),
    ...(cut.size > 0 && { cutoff: shown.filter((i) => !cut.has(i)).length }),
    ...(target >= 0 && { target }),
  };
}

const heatOf = (v: number, max: number, mode: 'abs' | 'value') => (v === -Infinity || max === 0 ? 0 : mode === 'abs' ? Math.abs(v) / max : Math.max(0, v) / max);

/** A matrix as a grid; heat is |v| / max|v| ('abs') or v / max v ('value', for probabilities). */
export function matrixGrid(m: Mat, rowLabels: string[], colLabels: string[], idPrefix: string, heat: 'abs' | 'value'): GridView {
  const finite = m.flat().filter(Number.isFinite);
  const max = Math.max(0, ...finite.map((v) => (heat === 'abs' ? Math.abs(v) : v)));
  return {
    kind: 'grid',
    colLabels,
    rows: m.map((row, r) => ({
      label: rowLabels[r],
      cells: row.map((v, c) => ({ id: `${idPrefix}-${r}-${c}`, value: fmt(v), role: 'default', heat: heatOf(v, max, heat) })),
    })),
  };
}

/** Vectors drawn as columns (one row per dimension), so 8 numbers fit a phone. */
export function vectorGrid(columns: { label: string; values: Vec }[], idPrefix: string): GridView {
  const dims = columns[0]?.values.length ?? 0;
  const m = Array.from({ length: dims }, (_, d) => columns.map((c) => c.values[d]!));
  return matrixGrid(m, Array.from({ length: dims }, (_, d) => `d${d}`), columns.map((c) => c.label), idPrefix, 'abs');
}

/** Chat messages as a grid: one row per message, labelled by speaker. */
export function messageGrid(messages: { speaker: string; content: string }[], idPrefix: string, roleOf: (i: number) => Role = () => 'default'): GridView {
  return {
    kind: 'grid',
    colLabels: ['message'],
    rows: messages.map((m, i) => ({ label: m.speaker, cells: [{ id: `${idPrefix}-${i}`, value: m.content, role: roleOf(i) }] })),
  };
}
