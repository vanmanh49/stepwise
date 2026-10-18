import { binarySearchCode, binarySearchSteps } from '../../algorithms/searching/binary';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Binary search finds a value in a sorted list by repeatedly looking at the middle item. If the middle is too small, the target must be to the right; if too large, to the left. Each comparison removes half of what is left, so even a million items need only about 20 checks.',
  concept: [
    'Think of guessing a number between 1 and 100 when you are told "higher" or "lower" after each guess. The smart first guess is 50, because either answer eliminates half the possibilities. Binary search does the same thing with a sorted array.',
    'The algorithm keeps two markers, low and high, around the part of the array that could still contain the target. Everything outside them has been ruled out.',
    'It only works because the data is sorted. Sorted order is what lets one comparison say something about every item on one side of the middle.',
  ],
  howItWorks: [
    'Set low to the first index and high to the last index.',
    'Find the middle index: mid = floor((low + high) / 2).',
    'If the middle value equals the target, return mid.',
    'If the middle value is smaller than the target, discard the left half: low = mid + 1.',
    'If the middle value is larger, discard the right half: high = mid − 1.',
    'Repeat until the value is found or low passes high, which means it is not there.',
  ],
  visualization: {
    kind: 'search',
    initial: [2, 5, 8, 12, 16, 23, 38, 45, 56, 72, 91],
    target: 38,
    needsSorted: true,
    generate: binarySearchSteps,
  },
  code: binarySearchCode,
  prosCons: {
    pros: ['Extremely fast on large sorted data', 'No extra memory', 'Its "halve the search space" idea applies to many other problems'],
    cons: ['Requires sorted data', 'Requires direct access by index, so it does not suit linked lists', 'Easy to get the boundaries wrong'],
    useWhen: ['The data is sorted and stored in an array', 'You search the same data many times', 'You are searching a range of answers where "too low / too high" can be tested'],
    avoidWhen: ['The data is unsorted and searched only once (sorting first costs more than a linear scan)', 'The data is in a linked list'],
  },
  applications: [
    'Looking up a word in a dictionary or a key in a sorted index',
    'git bisect: finding the commit that introduced a bug',
    'Finding where to insert a value into a sorted list',
    'Searching for the smallest setting that satisfies a condition, such as minimum capacity',
  ],
  commonMistakes: [
    'Running it on unsorted data. It will return wrong answers without any error.',
    'Writing low = mid or high = mid instead of mid + 1 and mid − 1, which can loop forever.',
    'Using low < high instead of low <= high, which skips the case where one item is left.',
    'In languages with fixed-size integers, computing (low + high) / 2 can overflow; low + (high − low) / 2 is safe.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Binary search is looking for 23 and has just compared it with the middle value, 16. What happens next?',
      view: binarySearchSteps([2, 5, 8, 12, 16, 23, 38, 45, 56], 23)[1]!.view,
      options: [
        'low moves to the index just right of the middle',
        'high moves to the index just left of the middle',
        'The search returns −1',
        'The middle moves one step to the right',
      ],
      answer: 0,
      explanation: '16 < 23, so the target can only be to the right. The middle and everything left of it are discarded by setting low = mid + 1.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the average time complexity of binary search?',
      options: ['O(log n)', 'O(n)', 'O(1)', 'O(n log n)'],
      answer: 0,
      explanation: 'Each comparison halves the remaining range, and a range of n can be halved about log₂ n times.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'A sorted array has 1,000,000 items. Roughly how many comparisons does binary search need in the worst case?',
      options: ['About 20', 'About 1,000', 'About 500,000', 'About 1,000,000'],
      answer: 0,
      explanation: '2²⁰ is a little over 1,000,000, so 20 halvings are enough to narrow a million items down to one.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'This call returns −1 even though 3 is in the array. Why?',
      code: `binarySearch([9, 3, 7, 1, 5], 3);`,
      options: [
        'The array is not sorted, so discarding a half is not valid',
        'Binary search cannot find odd numbers',
        'The array is too short',
        '3 is not at the middle index',
      ],
      answer: 0,
      explanation: 'The middle is 7. Since 3 < 7, the search keeps only [9, 3], checks 9, discards again and gives up. Throwing away a half is only safe when the data is sorted.',
    },
  ],
  summary: [
    'Binary search needs sorted data and direct access by index.',
    'Compare with the middle, then discard the half that cannot contain the target.',
    'Its cost is O(log n): a million items need about 20 comparisons.',
    'Be careful with the boundaries: use low <= high, mid + 1 and mid − 1.',
  ],
};

export default content;
