import type { Step } from '../../types/visualization';
import { readInt, readInts, refusal } from '../form';
import { at, tableGrid, type Mark } from './table';

export const knapsackCode = `function knapsack(weights: number[], values: number[], capacity: number): number {
  const n = weights.length;
  const dp = table(n + 1, capacity + 1, 0); // dp[i][c]: best value from the first i items within capacity c
  for (let i = 1; i <= n; i++) {
    for (let c = 0; c <= capacity; c++) {
      dp[i][c] = dp[i - 1][c]; // skip item i
      if (weights[i - 1] <= c) {
        dp[i][c] = Math.max(dp[i][c], dp[i - 1][c - weights[i - 1]] + values[i - 1]); // or take it
      }
    }
  }
  return dp[n][capacity];
}`;

const LINE = { init: 3, skip: 6, take: 8, done: 12 };

function fill(weights: number[], values: number[], capacity: number): number[][] {
  const dp = [Array.from({ length: capacity + 1 }, () => 0)];
  weights.forEach((w, k) => {
    const prev = dp[k]!;
    dp.push(prev.map((skip, c) => (w <= c ? Math.max(skip, prev[c - w]! + values[k]!) : skip)));
  });
  return dp;
}

function traceBack(dp: number[][], weights: number[], capacity: number): number[] {
  const items: number[] = [];
  let c = capacity;
  for (let i = weights.length; i >= 1; i--) {
    if (dp[i]![c] !== dp[i - 1]![c]) {
      items.unshift(i - 1);
      c -= weights[i - 1]!;
    }
  }
  return items;
}

export function knapsack(weights: number[], values: number[], capacity: number): { best: number; items: number[] } {
  const dp = fill(weights, values, capacity);
  return { best: dp[weights.length]![capacity]!, items: traceBack(dp, weights, capacity) };
}

export function knapsackSteps(input: Record<string, string>): Step[] {
  const empty = tableGrid([]);
  const wRead = readInts(input, 'weights', 'Weights', { min: 1, max: 5 }, { min: 1, max: 20 });
  if (!wRead.ok) return refusal('Check the weights', wRead.why, empty);
  const vRead = readInts(input, 'values', 'Values', { min: 1, max: 5 }, { min: 1, max: 20 });
  if (!vRead.ok) return refusal('Check the values', vRead.why, empty);
  const cRead = readInt(input, 'capacity', 'Capacity', { min: 0, max: 10 });
  if (!cRead.ok) return refusal('Check the capacity', cRead.why, empty);
  const weights = wRead.value;
  const values = vRead.value;
  const capacity = cRead.value;
  if (weights.length !== values.length) {
    return refusal('Weights and Values must match', `Weights has ${weights.length} numbers and Values has ${values.length}. Give one weight and one value per item.`, empty);
  }

  const n = weights.length;
  const full = fill(weights, values, capacity);
  const shown: (number | undefined)[][] = full.map((row, i) => row.map((v) => (i === 0 ? v : undefined)));
  const rowLabels = ['no items', ...weights.map((w, k) => `item ${k + 1} (w ${w}, v ${values[k]})`)];
  const colLabels = Array.from({ length: capacity + 1 }, (_, c) => String(c));
  const grid = (marks: Mark = {}, arrows: [number, number][][] = []) =>
    tableGrid(shown, { rowLabels, colLabels, marks, arrows: arrows.map(([from, to]) => ({ from: from!, to: to! })) });

  const steps: Step[] = [
    {
      title: 'With no items, every capacity is worth 0',
      why: 'dp[i][c] is the best total value using only the first i items with a bag of capacity c. With no items to choose from, the best is always 0. Each later row adds one more item.',
      next: `Fill the row for item 1 (weight ${weights[0]}, value ${values[0]}).`,
      codeLine: LINE.init,
      variables: { items: n, capacity },
      view: grid(),
    },
  ];

  for (let i = 1; i <= n; i++) {
    const w = weights[i - 1]!;
    const v = values[i - 1]!;
    for (let c = 0; c <= capacity; c++) {
      const skip = full[i - 1]![c]!;
      shown[i]![c] = full[i]![c];
      if (w > c) {
        steps.push({
          title: `dp[${i}][${c}] = ${skip}: item ${i} does not fit`,
          why: `Item ${i} weighs ${w}, more than capacity ${c}, so the only option is to skip it and keep the best without it.`,
          codeLine: LINE.skip,
          variables: { i, c, skip },
          view: grid({ [at(i, c)]: 'active', [at(i - 1, c)]: 'compare' }, [[[i - 1, c], [i, c]]]),
        });
        continue;
      }
      const take = full[i - 1]![c - w]! + v;
      const took = take > skip;
      steps.push({
        title: `dp[${i}][${c}] = ${full[i]![c]}: ${took ? 'take' : 'skip'} item ${i}`,
        why: `Skip it: ${skip} (the cell above). Take it: ${v} plus the best for the remaining capacity ${c - w}, which is ${full[i - 1]![c - w]}, so ${take}. ${took ? 'Taking it is better.' : take === skip ? 'Both are equal, so skipping is fine.' : 'Skipping is better.'}`,
        codeLine: LINE.take,
        variables: { i, c, skip, take },
        view: grid({ [at(i, c)]: 'active', [at(i - 1, c)]: 'compare', [at(i - 1, c - w)]: 'compare' }, [
          [[i - 1, c], [i, c]],
          [[i - 1, c - w], [i, c]],
        ]),
      });
    }
  }

  const items = traceBack(full, weights, capacity);
  const marks: Mark = {};
  let c = capacity;
  for (let i = n; i >= 1; i--) {
    marks[at(i, c)] = 'found';
    if (full[i]![c] !== full[i - 1]![c]) c -= weights[i - 1]!;
  }
  marks[at(0, c)] = 'found';
  const best = full[n]![capacity]!;
  steps.push({
    title: `Best value ${best}${items.length > 0 ? `: items ${items.map((k) => k + 1).join(', ')}` : ''}`,
    why:
      items.length > 0
        ? `Walk back from the bottom-right cell. Where a cell differs from the one above, that item was taken, and the walk jumps left by its weight. Items ${items.map((k) => k + 1).join(', ')} weigh ${items.reduce((s, k) => s + weights[k]!, 0)} in total and are worth ${best}.`
        : 'Nothing fits in the bag, so the best value is 0 and no item is taken.',
    codeLine: LINE.done,
    variables: { best },
    view: grid(marks),
  });
  return steps;
}
