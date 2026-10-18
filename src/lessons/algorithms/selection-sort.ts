import { selectionSortCode, selectionSortSteps } from '../../algorithms/sorting/selection';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Selection sort splits the list into a sorted part on the left and an unsorted part on the right. Each round it scans the unsorted part for the smallest value and swaps it into the next position. It makes very few swaps, but always the same large number of comparisons.',
  concept: [
    'Imagine sorting a hand of cards by repeatedly finding the lowest card that is still unsorted and placing it at the end of the sorted cards on the left.',
    'During a scan nothing moves. The algorithm only remembers the position of the smallest value seen so far. One swap at the end of the scan puts that value in place.',
    'Unlike bubble sort, selection sort cannot finish early. Even if the list is already sorted, it still scans everything to be sure each minimum really is the minimum.',
  ],
  howItWorks: [
    'Treat position 0 as the next slot to fill.',
    'Assume the value in that slot is the smallest, and remember its index.',
    'Scan every position to the right; whenever a smaller value appears, remember its index instead.',
    'After the scan, swap the smallest value into the slot (if it is not already there).',
    'Move the slot one position right and repeat until one value is left.',
  ],
  visualization: { kind: 'sort', initial: [29, 10, 14, 37, 13, 5], generate: selectionSortSteps },
  code: selectionSortCode,
  prosCons: {
    pros: ['At most n − 1 swaps', 'Simple and predictable: always the same amount of work', 'Sorts in place with no extra memory'],
    cons: ['O(n²) even when the list is already sorted', 'Not stable: the long-distance swap can reorder equal values'],
    useWhen: ['Writes are much more expensive than comparisons (for example, flash memory)', 'The list is small'],
    avoidWhen: ['The list is large', 'The list is nearly sorted (insertion sort is far better)', 'Equal items must keep their original order'],
  },
  applications: [
    'Sorting small lists where swap count matters',
    'Systems where each write wears out the storage',
    'Teaching the idea of a growing sorted section',
  ],
  commonMistakes: [
    'Swapping every time a smaller value is found, instead of once after the scan.',
    'Starting the inner scan at i instead of i + 1 (harmless but wasted work) or at 0 (wrong).',
    'Assuming it is stable. Sorting [5a, 5b, 2] moves 5a behind 5b.',
    'Expecting it to be faster on sorted input. It is not.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Selection sort is filling index 0. The current minimum is 29 and it is being compared with 10. What happens next?',
      view: selectionSortSteps([29, 10, 14, 37])[2]!.view,
      options: [
        'It remembers index 1 as the new minimum, without swapping yet',
        'It swaps 29 and 10 immediately',
        'It moves on to fill index 1',
        'Nothing changes, because 29 is still the minimum',
      ],
      answer: 0,
      explanation: '10 < 29, so the minimum index is updated. The swap only happens once the whole scan is finished.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the best-case time complexity of selection sort?',
      options: ['O(n²)', 'O(n)', 'O(n log n)', 'O(1)'],
      answer: 0,
      explanation: 'It always scans the whole unsorted part to find each minimum, even when the list is already sorted.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What is the maximum number of swaps selection sort makes on a list of n items?',
      options: ['n − 1', 'n²', 'n log n', 'n² / 2'],
      answer: 0,
      explanation: 'There is at most one swap per round, and there are n − 1 rounds.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What is the array after the first round (i = 0) of selection sort?',
      code: `selectionSort([4, 2, 7, 1]);`,
      options: ['[1, 2, 7, 4]', '[2, 4, 7, 1]', '[1, 4, 2, 7]', '[1, 2, 4, 7]'],
      answer: 0,
      explanation: 'The smallest value, 1 at index 3, swaps with the value at index 0. Nothing else moves.',
    },
  ],
  summary: [
    'Selection sort grows a sorted section on the left by selecting the smallest remaining value each round.',
    'It always performs about n²/2 comparisons: O(n²) in every case.',
    'It makes at most n − 1 swaps, fewer than bubble or insertion sort.',
    'It sorts in place but is not stable.',
  ],
};

export default content;
