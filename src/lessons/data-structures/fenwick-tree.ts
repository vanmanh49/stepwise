import { fenwickStructure } from '../../data-structures/fenwick';
import type { Lesson } from '../../types/lesson';

export const fenwickTree: Lesson = {
  id: 'fenwick-tree',
  title: 'Fenwick Tree',
  category: 'data-structures',
  difficulty: 'advanced',
  description: 'A clever array of partial sums that gives prefix sums and updates in O(log n) using binary.',
  keywords: ['binary indexed tree', 'bit', 'fenwick', 'prefix sum', 'range sum', 'lowest set bit', 'i & -i', 'point update'],
  prerequisites: ['prefix-sum'],
  overview:
    'A Fenwick tree (or binary indexed tree) keeps running sums of an array that keeps changing. It is just one array, the same length as the data, where each entry stores the sum of a block of positions. The size of each block comes from the binary form of its index. Prefix sums and updates both take O(log n), with only a few lines of code.',
  concept: [
    'Entry i stores the sum of the positions ending at i whose count is the lowest set bit of i, written i & -i. For example, 6 is 110 in binary, its lowest set bit is 2, so tree[6] holds positions 5 and 6. 8 is 1000, so tree[8] holds positions 1 to 8.',
    'To sum positions 1..i, add tree[i], then remove the lowest set bit from i and repeat until i is 0. Each step strips one bit, so there are at most log₂ n + 1 steps. A range l..r is then prefix(r) − prefix(l − 1).',
    'To add to position i, walk the other way: change tree[i], then add the lowest set bit to i and repeat while i ≤ n. Those are exactly the entries whose blocks contain position i.',
  ],
  howItWorks: [
    'Positions are numbered from 1, because the bit tricks do not work for 0.',
    'Prefix sum up to i: total += tree[i]; i -= i & -i; repeat while i > 0.',
    'Range sum l..r: prefix(r) − prefix(l − 1).',
    'Add delta at i: tree[i] += delta; i += i & -i; repeat while i ≤ n.',
    'Build: start with all zeros and add each value, or fill each entry from its block for O(n).',
  ],
  visualization: { kind: 'structure', structure: fenwickStructure },
  code: fenwickStructure.code,
  complexity: {
    rows: [
      { label: 'Prefix sum', best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
      { label: 'Range sum', best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' },
      { label: 'Add', best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
    ],
    space: 'O(n)',
    note: 'Each step of a prefix sum removes one set bit and each step of an update moves to a higher bit, so both take at most about log₂ n steps. The extra memory is one array of n numbers, half what a segment tree needs.',
    curves: ['log'],
  },
  compareWith: ['segment-tree', 'prefix-sum'],
  prosCons: {
    pros: ['Prefix sums and updates in O(log n)', 'One array and a few lines of code', 'Less memory and faster in practice than a segment tree'],
    cons: ['Works for sums and other invertible operations, not for min or max ranges', 'The bit tricks are hard to read at first', 'Positions must start at 1'],
    useWhen: ['You need running sums or counts of data that changes', 'You count inversions or ranks in competitive programming', 'Memory or code size matters'],
    avoidWhen: ['You need range minimum or maximum (use a segment tree)', 'The data never changes (a prefix-sum array is O(1) per query)'],
  },
  applications: [
    'Counting inversions in an array in O(n log n)',
    'Live cumulative statistics, such as running totals of sales by day',
    'Order statistics: how many values are below x, in a stream',
    'Compression and arithmetic coding, where frequencies change as data is read',
  ],
  commonMistakes: [
    'Using position 0. 0 & -0 is 0, so the loop never moves.',
    'Mixing up the two directions: prefix sums subtract the lowest bit, updates add it.',
    'Computing a range as prefix(r) − prefix(l) instead of prefix(r) − prefix(l − 1), which drops position l.',
    'Setting a value instead of adding the difference. To set a[i] to v, add v − a[i].',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Which tree entries does prefix(7) add?',
      view: fenwickStructure.view([5, 3, 7, 9, 6, 4, 1, 2]),
      options: ['7, 6 and 4', '7 and 8', '1 to 7', '7 only'],
      answer: 0,
      explanation: '7 is 111: add tree[7], drop the lowest bit to get 6 (110), add tree[6], drop it to get 4 (100), add tree[4], then 0. Three entries, one per set bit.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'How many steps does an update take on a Fenwick tree of n values?',
      options: ['O(log n)', 'O(1)', 'O(n)', 'O(√n)'],
      answer: 0,
      explanation: 'Each step adds the lowest set bit, which moves it to a higher bit position, so after at most about log₂ n steps it passes n.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What range of positions does tree[12] cover? (12 is 1100 in binary.)',
      options: ['9 to 12', '1 to 12', '12 only', '11 to 12'],
      answer: 0,
      explanation: 'The lowest set bit of 12 is 4, so tree[12] holds the 4 positions ending at 12: 9, 10, 11 and 12.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'n = 8. Which entries does this call change?',
      code: `add(5, 3);`,
      options: ['5, 6 and 8', '5 only', '5, 4 and 0', '5 to 8'],
      answer: 0,
      explanation: '5 + 1 = 6, 6 + 2 = 8, 8 + 8 = 16 which is past n. tree[5], tree[6] and tree[8] all include position 5.',
    },
  ],
  summary: [
    'A Fenwick tree is one array where tree[i] sums the i & -i positions ending at i.',
    'Prefix sums walk down by removing the lowest set bit; updates walk up by adding it.',
    'Both take O(log n), and a range sum is the difference of two prefix sums.',
    'It is smaller and simpler than a segment tree, but only for sums and similar operations.',
  ],
};
