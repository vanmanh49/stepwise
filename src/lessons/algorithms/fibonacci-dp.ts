import { fibonacciDpCode, fibonacciDpSteps } from '../../algorithms/dp/fibonacci';
import type { Lesson } from '../../types/lesson';

export const fibonacciDp: Lesson = {
  id: 'fibonacci-dp',
  title: 'Fibonacci DP',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Dynamic Programming',
  description: 'Turn an exponential recursion into a linear one by remembering answers: memoization and bottom-up tables.',
  keywords: ['dynamic programming', 'dp', 'memoization', 'tabulation', 'top-down', 'bottom-up', 'overlapping subproblems'],
  prerequisites: ['recursion-fundamentals'],
  overview:
    'Dynamic programming (DP) solves a problem by combining answers to smaller subproblems and storing each answer so it is computed only once. Fibonacci is the classic first example: naive recursion makes about 2ⁿ calls, while memoization (top-down) or a table (bottom-up) needs only n steps.',
  concept: [
    'Suppose someone asks you for 1 + 1 + 1 + 1 + 1. You count: five. Then they add another + 1 and ask again. You do not recount from scratch; you remember five and say six. Dynamic programming is exactly that: remember answers you already worked out.',
    'Naive fib(n) calls fib(n − 1) and fib(n − 2), which call the same smaller values again and again. These repeated pieces are called overlapping subproblems. A problem with overlapping subproblems, whose answer is built from answers to smaller versions, is a candidate for DP.',
    'Top-down DP, or memoization, keeps the recursion but stores every result in a memo. Before computing fib(k), look it up; if it is there, return it immediately. Watch the call tree: most branches are now cut short by a memo hit.',
    'Bottom-up DP, or tabulation, drops recursion completely. It fills a table from the smallest case upward: dp[0], dp[1], then dp[2] = dp[1] + dp[0], and so on. Every value needed is already in the table when it is used. The other DP lessons in this section all use tables like this one, just bigger.',
  ],
  howItWorks: [
    'Define the subproblem: dp[i] is the i-th Fibonacci number.',
    'Write the recurrence: dp[i] = dp[i − 1] + dp[i − 2], with base cases dp[0] = 0 and dp[1] = 1.',
    'Top-down: recurse, but store each result in a memo and look it up before recomputing.',
    'Bottom-up: fill the table from i = 2 up to n, each cell from the two before it.',
    'The answer is dp[n].',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'n', label: 'n', type: 'number', sample: '6', help: 'From 0 to 12.' },
      { name: 'method', label: 'Method', type: 'choice', sample: 'memo', options: ['memo', 'table'] },
    ],
    presets: [
      { label: 'n = 6, memo', values: { n: '6', method: 'memo' } },
      { label: 'n = 6, table', values: { n: '6', method: 'table' } },
      { label: 'n = 12, table', values: { n: '12', method: 'table' } },
    ],
    generate: fibonacciDpSteps,
  },
  code: fibonacciDpCode,
  complexity: {
    rows: [{ label: 'Fibonacci with DP', best: 'O(n)', average: 'O(n)', worst: 'O(n)' }],
    space: 'O(n)',
    note: 'Each value from 0 to n is computed once. The table version can keep only the last two values and run in O(1) memory.',
    curves: ['n'],
  },
  compareWith: ['recursion-fundamentals'],
  prosCons: {
    pros: ['Turns exponential time into linear time here', 'Memoization is a small change to a recursive solution', 'Tables avoid recursion and stack overflow'],
    cons: ['Uses memory for the stored answers', 'Only helps when subproblems actually repeat', 'Finding the right subproblem takes practice'],
    useWhen: ['The same subproblems are solved many times', 'The answer is built from answers to smaller versions of the problem'],
    avoidWhen: ['Subproblems never repeat (plain recursion or divide and conquer is enough)', 'A simple formula or greedy rule gives the answer'],
  },
  applications: [
    'Counting paths, ways or combinations',
    'Shortest and longest path problems on grids and sequences',
    'Text comparison such as diff tools and spell checkers',
    'Resource allocation problems such as knapsack and scheduling',
  ],
  commonMistakes: [
    'Storing the result in the memo but never checking the memo before recursing.',
    'Filling a table in the wrong order, so a cell reads values that are not computed yet.',
    'Getting the base cases wrong, which shifts every later value.',
    'Using a global memo across different inputs where the answers do not carry over.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The table holds dp[0] to dp[3]. What value goes into dp[4]?',
      view: fibonacciDpSteps({ n: '6', method: 'table' })[2]!.view,
      options: ['3', '2', '4', '5'],
      answer: 0,
      explanation: 'dp[4] = dp[3] + dp[2] = 2 + 1 = 3.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the time complexity of Fibonacci with memoization?',
      options: ['O(n)', 'O(2ⁿ)', 'O(n²)', 'O(log n)'],
      answer: 0,
      explanation: 'Each fib(k) for k from 0 to n is computed once; every other call is an O(1) lookup.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What is the difference between memoization and tabulation?',
      options: [
        'Memoization recurses from the top and caches results; tabulation fills a table from the bottom up',
        'Memoization uses less memory than any other method',
        'Tabulation only works for Fibonacci',
        'They are two names for naive recursion',
      ],
      answer: 0,
      explanation: 'Both store each subproblem’s answer once. They differ in direction: top-down with recursion, or bottom-up with a loop.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'How many calls does fibMemo(6) make, counting memo hits?',
      code: 'fibMemo(6);',
      options: ['11', '25', '6', '64'],
      answer: 0,
      explanation: 'fib(6) down to fib(1) is a chain of 6 calls. Add fib(0), a second fib(1) (a base case, answered before the memo is checked), and 3 memo hits for fib(2), fib(3) and fib(4): 11.',
    },
  ],
  summary: [
    'Dynamic programming stores the answer to each subproblem so it is computed once.',
    'Memoization is top-down recursion with a cache; tabulation fills a table bottom-up.',
    'Fibonacci drops from about 2ⁿ calls to n steps.',
    'DP applies when subproblems overlap and the answer builds on smaller answers.',
  ],
};
