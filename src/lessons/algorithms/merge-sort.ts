import { mergeSortCode, mergeSortSteps } from '../../algorithms/sorting/merge';
import type { LessonContent } from '../../types/lesson';
import type { Step } from '../../types/visualization';

const sample = mergeSortSteps([3, 8, 2, 5]);
// The first comparison of the final merge, where both halves are sorted.
const finalMerge = sample.filter((s: Step) => s.title.startsWith('Compare')).at(-3)!;

const content: LessonContent = {
  overview:
    'Merge sort is a divide-and-conquer algorithm. It keeps splitting the list in half until every piece holds a single value, then merges the pieces back together in sorted order. It takes O(n log n) time no matter how the input is arranged.',
  concept: [
    'Two observations make merge sort work. First, a list of one value is already sorted. Second, merging two sorted lists into one sorted list is easy: repeatedly take the smaller of the two front values.',
    'So the algorithm splits the problem until it is trivial, then does all the real work while merging on the way back up. This pattern (split, solve the parts, combine) is called divide and conquer.',
    'Merging needs somewhere to put the result, so merge sort uses an extra buffer about the size of the input. That is the price for its guaranteed speed.',
  ],
  howItWorks: [
    'If the list has zero or one value, it is already sorted. Return it.',
    'Split the list into a left half and a right half.',
    'Sort each half by applying the same steps to it (recursion).',
    'Merge: compare the front values of the two sorted halves and move the smaller one to the result.',
    'When one half runs out, append whatever remains of the other half.',
    'The merged result is the sorted list.',
  ],
  visualization: { kind: 'sort', initial: [38, 27, 43, 3, 9, 82, 10], generate: mergeSortSteps },
  code: mergeSortCode,
  prosCons: {
    pros: ['Guaranteed O(n log n), even in the worst case', 'Stable: equal values keep their order', 'Works well on linked lists and on data too large for memory'],
    cons: ['Needs O(n) extra memory', 'Slower than quick sort in practice on arrays, because of the copying', 'Overkill for tiny lists'],
    useWhen: ['You need a guaranteed worst case', 'Stability matters', 'You are sorting linked lists or data on disk'],
    avoidWhen: ['Memory is tight', 'The list is very small'],
  },
  applications: [
    'Timsort, the built-in sort of Python, Java (for objects) and modern JavaScript engines, is based on merge sort',
    'External sorting: sorting files larger than memory by merging sorted chunks',
    'Sorting linked lists',
    'Counting inversions in a list',
  ],
  commonMistakes: [
    'Forgetting the base case (length ≤ 1), which causes infinite recursion.',
    'Forgetting to append the leftovers after one half runs out.',
    'Using < instead of <= when comparing fronts, which breaks stability.',
    'Allocating new arrays carelessly at every level and using far more memory than needed.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Two sorted halves are being merged and their front values are being compared. What happens next?',
      view: finalMerge.view,
      options: [
        'The smaller of the two compared values moves to the merged list',
        'The larger of the two compared values moves to the merged list',
        'The two values swap places',
        'Both values move to the merged list together',
      ],
      answer: 0,
      explanation: 'Both halves are sorted, so the smaller front value is the smallest value remaining overall and goes next.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the worst-case time complexity of merge sort?',
      options: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'],
      answer: 0,
      explanation: 'The split always produces log n levels and each level does O(n) merging work, whatever the input order.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What is the main disadvantage of merge sort compared with quick sort?',
      options: [
        'It needs O(n) extra memory for merging',
        'It is O(n²) in the worst case',
        'It is not stable',
        'It cannot sort negative numbers',
      ],
      answer: 0,
      explanation: 'Merging needs a buffer. Quick sort partitions in place and only needs stack space for recursion.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this return?',
      code: `merge([2, 5, 9], [1, 6]);`,
      options: ['[1, 2, 5, 6, 9]', '[2, 5, 9, 1, 6]', '[1, 6, 2, 5, 9]', '[1, 2, 6, 5, 9]'],
      answer: 0,
      explanation: 'Take the smaller front each time: 1, 2, 5, 6. The right list is then empty, so the leftover 9 is appended.',
    },
  ],
  summary: [
    'Merge sort splits the list in half, sorts each half recursively and merges the results.',
    'Merging two sorted lists takes one pass: always take the smaller front value.',
    'It runs in O(n log n) in every case and is stable.',
    'It needs O(n) extra memory.',
  ],
};

export default content;
