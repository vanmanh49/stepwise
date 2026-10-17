import type { GridView, PanelsView, Role, Step } from '../../types/visualization';
import { readInt, refusal } from '../form';
import { CallTree } from '../recursion/callTree';

export const fibonacciDpCode = `function fibMemo(n: number, memo: number[] = []): number {
  if (n <= 1) return n;
  if (memo[n] !== undefined) return memo[n]; // already known
  memo[n] = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);
  return memo[n];
}

function fibTable(n: number): number {
  const dp = [0, 1];
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2]; // two cells to the left
  }
  return dp[n];
}`;

const LINE = { base: 2, hit: 3, recurse: 4, store: 5, tableInit: 9, fill: 11, tableDone: 13 };

export function fibonacciDp(n: number): number {
  const dp = [0, 1];
  for (let i = 2; i <= n; i++) dp[i] = dp[i - 1]! + dp[i - 2]!;
  return dp[n]!;
}

function row(dp: (number | undefined)[], n: number, roles: Record<number, Role> = {}, arrows: GridView['arrows'] = []): GridView {
  return {
    kind: 'grid',
    colLabels: Array.from({ length: n + 1 }, (_, i) => String(i)),
    rows: [
      {
        label: 'dp',
        cells: Array.from({ length: n + 1 }, (_, i) => ({ id: `m${i}`, value: dp[i] ?? '—', role: roles[i] ?? (dp[i] === undefined ? 'default' : 'sorted') })),
      },
    ],
    ...(arrows.length > 0 && { arrows }),
  };
}

function memoSteps(n: number): Step[] {
  const memo: (number | undefined)[] = [];
  const tree = new CallTree();
  const view = (roles: Record<number, Role> = {}): PanelsView => ({
    kind: 'panels',
    panels: [
      { label: 'Calls', view: tree.view() },
      { label: 'Memo', view: row(memo, n, roles) },
    ],
  });
  const steps: Step[] = [
    {
      title: `Compute fib(${n}) with a memo`,
      why: 'Naive recursion recomputes the same values again and again. Memoization stores each answer the first time it is computed and looks it up after that.',
      next: `Call fib(${n}).`,
      codeLine: 1,
      variables: { n },
      view: view(),
    },
  ];
  const fib = (k: number): number => {
    tree.call(`fib(${k})`);
    if (k <= 1) {
      memo[k] = k;
      steps.push({
        title: `fib(${k}) is a base case`,
        why: `It returns ${k} directly. The memo records it too.`,
        codeLine: LINE.base,
        variables: { n: k },
        view: view({ [k]: 'found' }),
      });
      tree.finish(k);
      return k;
    }
    if (memo[k] !== undefined) {
      steps.push({
        title: `fib(${k}) is already in the memo`,
        why: `fib(${k}) = ${memo[k]} was stored earlier, so this call returns at once instead of growing a whole subtree of calls.`,
        codeLine: LINE.hit,
        variables: { n: k, 'memo[n]': memo[k]! },
        view: view({ [k]: 'found' }),
      });
      tree.finish(memo[k], true);
      return memo[k]!;
    }
    steps.push({
      title: `fib(${k}) is not known yet`,
      why: `Compute it from fib(${k - 1}) and fib(${k - 2}).`,
      codeLine: LINE.recurse,
      variables: { n: k },
      view: view({ [k]: 'active' }),
    });
    const value = fib(k - 1) + fib(k - 2);
    memo[k] = value;
    tree.finish(value);
    steps.push({
      title: `Store fib(${k}) = ${value}`,
      why: `fib(${k - 1}) + fib(${k - 2}) = ${value}. Saving it means no later call ever computes fib(${k}) again.`,
      codeLine: LINE.store,
      variables: { n: k, 'memo[n]': value },
      view: view({ [k]: 'found' }),
    });
    return value;
  };
  const result = fib(n);
  const calls = n <= 1 ? 1 : 2 * n - 1;
  steps.push({
    title: `fib(${n}) = ${result} in ${calls} call${calls === 1 ? '' : 's'}`,
    why: `Each value is computed once, so the work grows in a straight line with n. Naive recursion needs ${naiveCalls(n)} calls for the same answer.`,
    codeLine: LINE.store,
    variables: { result, calls },
    view: view(),
  });
  return steps;
}

const naiveCalls = (n: number): number => (n <= 1 ? 1 : 1 + naiveCalls(n - 1) + naiveCalls(n - 2));

function tableSteps(n: number): Step[] {
  const dp: (number | undefined)[] = [0, 1].slice(0, n + 1);
  const steps: Step[] = [
    {
      title: n === 0 ? 'Start the table with dp[0] = 0' : 'Start the table with dp[0] = 0 and dp[1] = 1',
      why: 'Bottom-up dynamic programming fills a table from the smallest subproblems upward, so every value needed is already there when it is used. No recursion is needed.',
      codeLine: LINE.tableInit,
      variables: { n },
      view: row(dp, n),
    },
  ];
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1]! + dp[i - 2]!;
    steps.push({
      title: `dp[${i}] = ${dp[i - 1]} + ${dp[i - 2]} = ${dp[i]}`,
      why: `The two cells to the left are already filled, so dp[${i}] is one addition.`,
      codeLine: LINE.fill,
      variables: { i, 'dp[i]': dp[i]! },
      view: row(dp, n, { [i]: 'active', [i - 1]: 'compare', [i - 2]: 'compare' }, [
        { from: [0, i - 1], to: [0, i] },
        { from: [0, i - 2], to: [0, i] },
      ]),
    });
  }
  steps.push({
    title: `fib(${n}) = ${dp[n]}`,
    why: `The last cell is the answer. Each of the ${n + 1} cells was filled once, so this is O(n) time, and only two earlier cells are ever read, so it could even run in O(1) memory.`,
    codeLine: LINE.tableDone,
    variables: { result: dp[n]! },
    view: row(dp, n, { [n]: 'found' }),
  });
  return steps;
}

export function fibonacciDpSteps(values: Record<string, string>): Step[] {
  const nRead = readInt(values, 'n', 'n', { min: 0, max: 12 });
  const method = values['method'];
  if (!nRead.ok) return refusal('Check n', nRead.why, row([], 0));
  if (method !== 'memo' && method !== 'table') return refusal('Choose a method', 'Pick memo (top-down) or table (bottom-up).', row([], 0));
  return method === 'memo' ? memoSteps(nRead.value) : tableSteps(nRead.value);
}
