import { lisCode, lisSteps } from '../../algorithms/dp/lis';
import type { Lesson } from '../../types/lesson';

const example = [10, 9, 2, 5, 3, 7, 101, 18];

export const lis: Lesson = {
  id: 'lis',
  title: 'Longest Increasing Subsequence',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Dynamic Programming',
  description: 'Find the longest run of values that keep rising, picked from a list in order, with gaps allowed.',
  keywords: ['lis', 'increasing subsequence', 'dynamic programming', 'predecessor', 'patience sorting', 'sequence'],
  prerequisites: ['fibonacci-dp'],
  overview:
    'Given a list of numbers, the longest increasing subsequence (LIS) is the longest selection of values, kept in their original order, where each value is larger than the one before. Values may be skipped. Dynamic programming finds it by working out, for every position, the longest increasing run that ends exactly there.',
  concept: [
    'Picture a stock price over a few weeks. You want the longest stretch of days you could pick, in date order, where each picked price beats the previous pick. You may skip days, but you cannot go back in time. That is the longest increasing subsequence.',
    'The trick is to ask a narrower question for each position i: what is the longest increasing run that ends with the value at i? Call it length[i]. A run ending at i must have come from some earlier position j with a smaller value, so length[i] = 1 + the largest length[j] among those.',
    'If no earlier value is smaller, the run is the value alone, length 1. Recording which j gave the best length, in from[i], lets you rebuild the actual subsequence at the end by following the links backwards.',
    'This straightforward version compares every pair, which is O(n²). A cleverer method using binary search reaches O(n log n), but the table version shows the dynamic programming idea most clearly.',
  ],
  howItWorks: [
    'Set length[i] = 1 and from[i] = none for every position.',
    'For each position i, look at every earlier position j.',
    'If arr[j] < arr[i] and length[j] + 1 beats length[i], set length[i] = length[j] + 1 and from[i] = j.',
    'The answer’s length is the largest value in length.',
    'Follow from[] back from that position to list the subsequence.',
  ],
  visualization: { kind: 'sort', initial: example, generate: lisSteps },
  code: lisCode,
  complexity: {
    rows: [{ label: 'LIS (O(n²) DP)', best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)' }],
    space: 'O(n)',
    note: 'Every position is compared with every earlier one. A binary-search version (patience sorting) brings this down to O(n log n).',
    curves: ['n2'],
  },
  compareWith: ['lcs'],
  prosCons: {
    pros: ['Simple table with one entry per position', 'Recovers the subsequence, not just its length', 'Easy to adapt, for example to non-decreasing runs'],
    cons: ['O(n²) is slow for long lists', 'The faster O(n log n) version is harder to understand'],
    useWhen: ['Lists of up to a few thousand values', 'You need the subsequence itself'],
    avoidWhen: ['Lists with millions of values (use the binary-search version)'],
  },
  applications: [
    'Finding long upward trends in time series',
    'Stacking or nesting problems such as boxes or envelopes',
    'Measuring how sorted a list already is',
    'Building block for diff algorithms and sequence alignment',
  ],
  commonMistakes: [
    'Returning length[n − 1] instead of the largest length anywhere.',
    'Using ≤ instead of <, which allows equal values in a strictly increasing run.',
    'Confusing it with the longest increasing contiguous run, which cannot skip values.',
    'Forgetting to store predecessors, so the subsequence cannot be rebuilt.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The table is filled up to position 4. Position 5 holds 7. What is length[5]?',
      view: lisSteps(example)[4]!.view,
      options: ['3', '2', '1', '4'],
      answer: 0,
      explanation: 'Earlier smaller values 2, 5 and 3 have lengths 1, 2 and 2. The best is 2, so 7 makes a run of 3.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What is the LIS length of [3, 1, 2, 5, 4]?',
      options: ['3', '2', '4', '5'],
      answer: 0,
      explanation: 'For example 1, 2, 5 or 1, 2, 4. No increasing selection of 4 values exists.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the running time of the table method shown here?',
      options: ['O(n²)', 'O(n)', 'O(2ⁿ)', 'O(n³)'],
      answer: 0,
      explanation: 'Each of the n positions is compared with every earlier position.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this call return?',
      code: 'lis([5, 4, 3]).length;',
      options: ['1', '0', '3', '2'],
      answer: 0,
      explanation: 'The list only falls, so the best increasing run is a single value.',
    },
  ],
  summary: [
    'The LIS is the longest strictly increasing selection of values, in order, with gaps allowed.',
    'length[i] is the longest increasing run ending at position i.',
    'length[i] = 1 + the best length[j] over earlier smaller values; from[i] remembers j.',
    'This method is O(n²); a binary-search version reaches O(n log n).',
  ],
};
