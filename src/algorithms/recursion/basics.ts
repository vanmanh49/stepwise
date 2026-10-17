import type { Step } from '../../types/visualization';
import { readInt, refusal } from '../form';
import { CallTree } from './callTree';

export const recursionCode = `function factorial(n: number): number {
  if (n <= 1) return 1; // base case
  return n * factorial(n - 1);
}

function fib(n: number): number {
  if (n <= 1) return n; // base case
  return fib(n - 1) + fib(n - 2);
}`;

const LINE = {
  factorial: { call: 1, base: 2, recurse: 3 },
  fibonacci: { call: 6, base: 7, recurse: 8 },
};

export function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

export function fibonacciNaive(n: number): { value: number; calls: number } {
  let calls = 0;
  const fib = (k: number): number => {
    calls++;
    return k <= 1 ? k : fib(k - 1) + fib(k - 2);
  };
  return { value: fib(n), calls };
}

export function recursionSteps(values: Record<string, string>): Step[] {
  const fn = values['fn'];
  const nRead = readInt(values, 'n', 'n', { min: 0, max: 6 });
  if (fn !== 'factorial' && fn !== 'fibonacci') {
    return refusal('Choose a function', 'Pick factorial or fibonacci.', { kind: 'calls', frames: [] });
  }
  if (!nRead.ok) return refusal('Check n', `${nRead.why} Bigger values make the call tree too large to follow.`, { kind: 'calls', frames: [] });

  const n = nRead.value;
  const lines = LINE[fn];
  const short = fn === 'factorial' ? 'factorial' : 'fib';
  const tree = new CallTree();
  const seen = new Set<number>();
  const steps: Step[] = [
    {
      title: `Call ${short}(${n})`,
      why:
        fn === 'factorial'
          ? 'A recursive function solves a problem by calling itself on a smaller version of it. factorial(n) = n × factorial(n − 1), until the base case n ≤ 1.'
          : 'fib(n) = fib(n − 1) + fib(n − 2), until the base cases fib(0) = 0 and fib(1) = 1. Each call makes two more calls, so watch the tree grow.',
      next: 'Each call waits on the call stack until the calls it makes return.',
      codeLine: lines.call,
      variables: { n },
      view: { kind: 'calls', frames: [] },
    },
  ];

  const run = (k: number): number => {
    tree.call(`${short}(${k})`);
    const repeated = fn === 'fibonacci' && seen.has(k);
    seen.add(k);
    if (k <= 1) {
      const result = fn === 'factorial' ? 1 : k;
      steps.push({
        title: `${short}(${k}) is a base case`,
        why: `${repeated ? `fib(${k}) is being computed again, even though an earlier call already worked it out. ` : ''}It returns ${result} straight away without calling itself, which is what stops the recursion.`,
        codeLine: lines.base,
        variables: { n: k, depth: tree.depth },
        view: tree.view(),
      });
      tree.finish(result);
      return result;
    }
    steps.push({
      title: `${short}(${k}) calls ${fn === 'factorial' ? `factorial(${k - 1})` : `fib(${k - 1}) and fib(${k - 2})`}`,
      why: repeated
        ? `fib(${k}) is being computed again: an earlier branch already did all this work. The naive version has no memory, which is why it is so slow.`
        : `${k} is not a base case, so ${short}(${k}) must wait for the smaller call${fn === 'factorial' ? '' : 's'} to return first. The waiting calls form the call stack.`,
      codeLine: lines.recurse,
      variables: { n: k, depth: tree.depth },
      view: tree.view(),
    });
    const result = fn === 'factorial' ? k * run(k - 1) : run(k - 1) + run(k - 2);
    tree.finish(result);
    steps.push({
      title: `${short}(${k}) returns ${result}`,
      why:
        fn === 'factorial'
          ? `factorial(${k - 1}) returned ${result / k}, so ${k} × ${result / k} = ${result}. The frame is removed from the stack and its caller resumes.`
          : `Both smaller calls have returned, and their sum is ${result}. The frame is removed from the stack and its caller resumes.`,
      codeLine: lines.recurse,
      variables: { n: k, result },
      view: tree.view(),
    });
    return result;
  };
  const result = run(n);
  const calls = fn === 'fibonacci' ? fibonacciNaive(n).calls : Math.max(n, 1);
  steps.push({
    title: `${short}(${n}) = ${result}`,
    why:
      fn === 'factorial'
        ? `${calls} call${calls === 1 ? '' : 's'}, one per value of n: the work grows in a straight line with n.`
        : `It took ${calls} calls. The same small values were computed over and over, and the number of calls roughly doubles each time n grows by one.`,
    codeLine: lines.recurse,
    variables: { result, calls },
    view: tree.view(),
  });
  return steps;
}
