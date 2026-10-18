import { twoPointersCode, twoPointersSteps } from '../../algorithms/techniques/twoPointers';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Two pointers is a technique, not a single algorithm: keep two positions in a list and move them according to a rule. On sorted data it can replace a loop inside a loop with one pass. This lesson uses the classic example of finding two values that add up to a target.',
  concept: [
    'The obvious way to find a pair is to try every combination: for each value, check it against every other value. With n values that is about n²/2 checks.',
    'Sorting changes the game. Put one pointer on the smallest value and one on the largest, and add them. If the sum is too small, the smallest value is useless: even its best possible partner was not enough. Move the left pointer right. If the sum is too large, the largest value is useless for the same reason. Move the right pointer left.',
    'Each comparison permanently rules out one value, so after at most n − 1 steps the pointers meet and the answer is known. The technique works because sorted order lets one comparison say something about many pairs at once.',
    'The same idea, with different rules for moving the pointers, reverses arrays, checks palindromes, removes duplicates and merges sorted lists.',
  ],
  howItWorks: [
    'Sort the list if it is not sorted already.',
    'Place left at the first index and right at the last.',
    'Add the two values under the pointers.',
    'If the sum equals the target, the pair is found.',
    'If the sum is too small, move left one step right. If it is too large, move right one step left.',
    'Stop when the pointers meet: no pair exists.',
  ],
  visualization: {
    kind: 'search',
    initial: [1, 3, 4, 6, 8, 11, 13],
    target: 15,
    needsSorted: true,
    targetLabel: 'Target sum',
    targetHelp: '1–12 whole numbers, separated by commas, and the sum two of them should add up to.',
    randomTarget: (values) => {
      const i = Math.floor(Math.random() * values.length);
      const j = (i + 1 + Math.floor(Math.random() * (values.length - 1))) % values.length;
      return values[i]! + values[j]!;
    },
    generate: twoPointersSteps,
  },
  code: twoPointersCode,
  prosCons: {
    pros: ['Turns many O(n²) pair problems into O(n)', 'Needs no extra memory', 'Short and easy to get right once the rule is clear'],
    cons: ['Usually needs sorted data, or some other order to exploit', 'The rule for moving the pointers is different for each problem'],
    useWhen: ['The data is sorted and you are looking for a pair or a range', 'You need to compare or swap elements from both ends', 'You are merging two sorted sequences'],
    avoidWhen: ['The data is unsorted and must stay in its original order (a hash table finds pairs in O(n) without sorting)'],
  },
  applications: [
    'Finding a pair or triple of numbers with a given sum',
    'Reversing an array or checking a palindrome in place',
    'Removing duplicates from a sorted list',
    'The merge step of merge sort, with one pointer in each half',
  ],
  commonMistakes: [
    'Using it on unsorted data. The reasoning for discarding a value only holds when the list is in order.',
    'Looping while left <= right, which pairs a value with itself.',
    'Moving both pointers after a mismatch, which skips valid pairs.',
    'Forgetting that sorting changes the indexes, when the original positions are what the problem asks for.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The target sum is 15 and the pointers are on 1 and 13, which add up to 14. What happens next?',
      view: twoPointersSteps([1, 3, 4, 6, 8, 11, 13], 15)[1]!.view,
      options: [
        'The left pointer moves right, to 3',
        'The right pointer moves left, to 11',
        'Both pointers move inward',
        'The search stops: no pair exists',
      ],
      answer: 0,
      explanation: '14 is too small. 13 is already the largest partner available, so 1 can never reach 15 and is ruled out by moving left forward.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the worst-case time complexity of the two-pointer pair search on a sorted list of n values?',
      options: ['O(n)', 'O(n²)', 'O(log n)', 'O(n log n)'],
      answer: 0,
      explanation: 'Each step moves one pointer one position inward, and they can move at most n − 1 positions in total.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why does this technique need the list to be sorted?',
      options: [
        'So that a sum that is too small or too large tells you which end to discard',
        'So that the answer is always in the middle',
        'Because pointers cannot move through unsorted data',
        'So that duplicate values are removed',
      ],
      answer: 0,
      explanation: 'In sorted order, moving left right can only increase the sum and moving right left can only decrease it. Without order, a wrong sum says nothing.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this return?',
      code: `twoSumSorted([2, 4, 7, 11], 9);`,
      options: ['[0, 2]', '[1, 2]', '[0, 3]', 'null'],
      answer: 0,
      explanation: '2 + 11 = 13 is too large, so right moves to 7. 2 + 7 = 9 matches, giving indexes 0 and 2.',
    },
  ],
  summary: [
    'Two pointers walks two positions through a list according to a rule.',
    'For a pair sum in sorted data: too small moves left forward, too large moves right back.',
    'Each step rules out one value, so the search is O(n) with O(1) extra memory.',
    'It depends on the data being sorted.',
  ],
};

export default content;
