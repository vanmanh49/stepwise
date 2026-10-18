import { recursionCode, recursionSteps } from '../../algorithms/recursion/basics';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A recursive function solves a problem by calling itself on a smaller version of the same problem, until it reaches a base case it can answer directly. This lesson steps through factorial, where each call makes one smaller call, and naive Fibonacci, where each call makes two, so you can see both the call stack and how quickly repeated work piles up.',
  concept: [
    'Picture a queue of people where you want to know your position. You ask the person in front, who asks the person in front of them, and so on until the first person says "I am number 1". Each answer then comes back down the line, each person adding one. That is recursion: hand a smaller question onward, wait, then build your answer from the reply.',
    'Every recursive function needs two parts. The base case answers the smallest version directly, like factorial(1) = 1, and stops the chain. The recursive case reduces the problem, like factorial(n) = n × factorial(n − 1), and must always move toward the base case, or the calls never end.',
    'While a call waits for the calls it made, it sits on the call stack. Each frame remembers its own n and where to resume. That is why deep recursion uses memory, and why forgetting the base case ends in a stack overflow.',
    'Naive Fibonacci makes two calls each time, so the calls form a tree. fib(5) computes fib(2) three times and fib(1) five times. The number of calls roughly doubles with each step up in n, which is the problem the Fibonacci DP lesson fixes.',
  ],
  howItWorks: [
    'Check the base case first. If the input is small enough, return the answer directly.',
    'Otherwise call the same function on a smaller input.',
    'The current call waits on the call stack until that call returns.',
    'Combine the returned value with the current input to build this call’s answer.',
    'Return it, so the waiting caller can continue.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'fn', label: 'Function', type: 'choice', sample: 'fibonacci', options: ['fibonacci', 'factorial'] },
      { name: 'n', label: 'n', type: 'number', sample: '5', help: 'From 0 to 6.' },
    ],
    presets: [
      { label: 'fib(5)', values: { fn: 'fibonacci', n: '5' } },
      { label: '5!', values: { fn: 'factorial', n: '5' } },
      { label: 'fib(6)', values: { fn: 'fibonacci', n: '6' } },
    ],
    generate: recursionSteps,
  },
  code: recursionCode,
  prosCons: {
    pros: ['Matches problems that are defined in terms of themselves, such as trees', 'Often much shorter and clearer than a loop', 'The basis of divide and conquer, backtracking and dynamic programming'],
    cons: ['Every waiting call uses stack memory', 'Too deep a recursion overflows the stack', 'Naive recursion can repeat the same work many times'],
    useWhen: ['The data is recursive, such as trees, nested lists or file folders', 'The problem splits into smaller copies of itself'],
    avoidWhen: ['A simple loop does the job', 'The recursion could be thousands of levels deep', 'The same subproblems repeat (add memoization)'],
  },
  applications: [
    'Walking trees and nested folders',
    'Divide-and-conquer sorts such as merge sort and quick sort',
    'Parsing nested expressions like (1 + (2 × 3))',
    'Backtracking searches such as solving puzzles',
  ],
  commonMistakes: [
    'Forgetting the base case, so the function calls itself forever and overflows the stack.',
    'Making a recursive call that does not move toward the base case, such as factorial(n) calling factorial(n).',
    'Forgetting to return the recursive call’s result.',
    'Using naive recursion for Fibonacci-like problems, where the same values are recomputed exponentially often.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'fib(2) is waiting while fib(1), a base case, returns 1. What happens next?',
      view: recursionSteps({ fn: 'fibonacci', n: '2' })[2]!.view,
      options: ['fib(2) calls fib(0)', 'fib(2) returns 1', 'fib(1) is called again', 'The program stops'],
      answer: 0,
      explanation: 'fib(2) = fib(1) + fib(0). It has the first half and now needs the second, so it calls fib(0).',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What is the purpose of the base case?',
      options: ['It stops the recursion by answering the smallest input directly', 'It makes the function faster', 'It stores results for later', 'It handles invalid input'],
      answer: 0,
      explanation: 'Without a base case, every call makes another call and the recursion never ends.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'Roughly how does the number of calls of naive fib(n) grow?',
      options: ['Exponentially, about doubling each time n grows by 1', 'Linearly with n', 'Logarithmically', 'It stays constant'],
      answer: 0,
      explanation: 'Each call makes two more, so the call tree has about 2ⁿ nodes.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this return?',
      code: 'function f(n: number): number {\n  if (n === 0) return 0;\n  return n + f(n - 1);\n}\nf(4);',
      options: ['10', '4', '24', '0'],
      answer: 0,
      explanation: 'f(4) = 4 + 3 + 2 + 1 + 0 = 10.',
    },
  ],
  summary: [
    'A recursive function calls itself on a smaller input until it reaches a base case.',
    'Waiting calls sit on the call stack, which costs memory.',
    'Factorial makes a chain of n calls; naive Fibonacci makes a tree of about 2ⁿ calls.',
    'Repeated work in the tree is what memoization and dynamic programming remove.',
  ],
};

export default content;
