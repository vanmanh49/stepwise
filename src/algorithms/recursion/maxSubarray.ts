import type { ArrayView, PanelsView, Role, Step } from '../../types/visualization';
import { toCells } from '../sorting/cells';
import { CallTree } from './callTree';

export const maxSubarrayCode = `function maxSubarray(arr: number[], lo = 0, hi = arr.length - 1): number {
  if (lo === hi) return arr[lo]; // one value: it is the best
  const mid = Math.floor((lo + hi) / 2);
  const left = maxSubarray(arr, lo, mid);
  const right = maxSubarray(arr, mid + 1, hi);
  const cross = bestEndingAt(arr, mid, lo) + bestStartingAt(arr, mid + 1, hi); // must use mid and mid + 1
  return Math.max(left, right, cross);
}`;

const LINE = { base: 2, split: 3, cross: 6, combine: 7 };

interface Run {
  sum: number;
  start: number;
  end: number;
}

/** Higher sum wins; ties go to the smaller start, then the smaller end. */
const better = (a: Run, b: Run) => a.sum > b.sum || (a.sum === b.sum && (a.start < b.start || (a.start === b.start && a.end < b.end)));

function crossing(values: number[], lo: number, mid: number, hi: number): Run {
  let leftBest = -Infinity;
  let start = mid;
  for (let i = mid, sum = 0; i >= lo; i--) {
    sum += values[i]!;
    if (sum >= leftBest) [leftBest, start] = [sum, i];
  }
  let rightBest = -Infinity;
  let end = mid + 1;
  for (let j = mid + 1, sum = 0; j <= hi; j++) {
    sum += values[j]!;
    if (sum > rightBest) [rightBest, end] = [sum, j];
  }
  return { sum: leftBest + rightBest, start, end };
}

function solve(values: number[], lo: number, hi: number): Run {
  if (lo === hi) return { sum: values[lo]!, start: lo, end: lo };
  const mid = Math.floor((lo + hi) / 2);
  return [solve(values, lo, mid), solve(values, mid + 1, hi), crossing(values, lo, mid, hi)].reduce((a, b) => (better(b, a) ? b : a));
}

export function maxSubarray(values: number[]): Run {
  return solve(values, 0, values.length - 1);
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

export function maxSubarraySteps(values: number[]): Step[] {
  const cells = toCells(values);
  const tree = new CallTree();
  const array = (roles: Record<number, Role>, pointers?: Record<string, number>): ArrayView => ({
    kind: 'array',
    cells: cells.map((c, i) => ({ ...c, role: roles[i] ?? 'default' })),
    ...(pointers && { pointers }),
  });
  const view = (roles: Record<number, Role> = {}, pointers?: Record<string, number>): PanelsView => ({
    kind: 'panels',
    panels: [
      { view: array(roles, pointers) },
      { label: 'Calls', view: tree.view() },
    ],
  });
  const paint = (indexes: number[], role: Role) => Object.fromEntries(indexes.map((i) => [i, role]));
  const steps: Step[] = [
    {
      title: 'Find the contiguous run with the largest sum',
      why: 'Divide and conquer splits the problem in half, solves each half the same way, then combines. The best run is either entirely in the left half, entirely in the right half, or crosses the middle.',
      next: 'Split the whole array.',
      codeLine: 1,
      view: view(),
    },
  ];

  const run = (lo: number, hi: number): Run => {
    tree.call(`best(${lo}..${hi})`);
    if (lo === hi) {
      steps.push({
        title: `A single value: ${values[lo]}`,
        why: `A range of one value has only one run, so its best sum is ${values[lo]}. This is the base case.`,
        codeLine: LINE.base,
        view: view({ [lo]: 'active' }),
      });
      tree.finish(values[lo]);
      return { sum: values[lo]!, start: lo, end: lo };
    }
    const mid = Math.floor((lo + hi) / 2);
    steps.push({
      title: `Split ${lo}..${hi} at ${mid}`,
      why: `Solve ${lo}..${mid} and ${mid + 1}..${hi} separately, each with the same method.`,
      codeLine: LINE.split,
      variables: { lo, mid, hi },
      view: view(paint(range(lo, hi), 'compare'), { lo, mid, hi }),
    });
    const left = run(lo, mid);
    const right = run(mid + 1, hi);
    const cross = crossing(values, lo, mid, hi);
    steps.push({
      title: `Best run crossing the middle: ${cross.sum}`,
      why: `A crossing run must include positions ${mid} and ${mid + 1}. Extending left from ${mid} as far as it helps and right from ${mid + 1} as far as it helps gives ${cross.start}..${cross.end} with sum ${cross.sum}.`,
      codeLine: LINE.cross,
      variables: { left: left.sum, right: right.sum, cross: cross.sum },
      view: view({ ...paint(range(lo, hi), 'compare'), ...paint(range(cross.start, cross.end), 'active') }, { lo, mid, hi }),
    });
    const best = [left, right, cross].reduce((a, b) => (better(b, a) ? b : a));
    const where = best === left ? 'the left half' : best === right ? 'the right half' : 'the crossing run';
    tree.finish(best.sum);
    steps.push({
      title: `Best of ${lo}..${hi} is ${best.sum}`,
      why: `Compare left ${left.sum}, right ${right.sum} and crossing ${cross.sum}: ${where} wins with ${best.start}..${best.end}.`,
      codeLine: LINE.combine,
      variables: { best: best.sum },
      view: view({ ...paint(range(lo, hi), 'compare'), ...paint(range(best.start, best.end), 'found') }),
    });
    return best;
  };
  const best = run(0, values.length - 1);
  steps.push({
    title: `Largest sum: ${best.sum}, from index ${best.start} to ${best.end}`,
    why: 'Every half was solved and combined on the way back up, so the top call’s answer covers the whole array.',
    codeLine: LINE.combine,
    variables: { sum: best.sum, start: best.start, end: best.end },
    view: view(paint(range(best.start, best.end), 'found')),
  });
  return steps;
}
