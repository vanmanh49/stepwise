import { linearSearchCode, linearSearchSteps } from '../../algorithms/searching/linear';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Linear search is the most direct way to find something: start at the first item and check each one in turn until you find the target or run out of items. It needs no preparation and works on any list, sorted or not.',
  concept: [
    'Imagine looking for a specific card in a shuffled deck. With no order to exploit, all you can do is turn over one card at a time. That is linear search.',
    'Its strength is that it assumes nothing. The data can be in any order, and it can be an array, a linked list or a stream you can only read once.',
    'Its weakness is that the work grows in step with the data. Twice as many items means, on average, twice as many checks.',
  ],
  howItWorks: [
    'Start at index 0.',
    'Compare the current item with the target.',
    'If they are equal, return the current index and stop.',
    'Otherwise move one position to the right and repeat.',
    'If the end is reached with no match, return −1 to signal "not found".',
  ],
  visualization: {
    kind: 'search',
    initial: [14, 3, 27, 8, 19, 42, 5, 31],
    target: 19,
    needsSorted: false,
    generate: linearSearchSteps,
  },
  code: linearSearchCode,
  prosCons: {
    pros: ['Works on unsorted data', 'Works on any sequence, including linked lists', 'Trivial to write correctly', 'No extra memory'],
    cons: ['Slow on large collections', 'Does the same work every time you search'],
    useWhen: ['The list is small', 'The data is unsorted and searched only once or twice', 'You can only read the data sequentially'],
    avoidWhen: ['The data is sorted (use binary search)', 'You search the same large collection repeatedly (sort it or use a hash table)'],
  },
  applications: [
    'Array methods such as indexOf, includes and find',
    'Searching short lists where setup cost would outweigh any gain',
    'Scanning a log file for the first line that matches',
    'The fallback when nothing is known about the data',
  ],
  commonMistakes: [
    'Returning "not found" inside the loop after the first mismatch, instead of after the loop ends.',
    'Looping to i <= arr.length, which reads one slot past the end.',
    'Using linear search inside another loop over the same data, creating accidental O(n²) work.',
    'Using it on sorted data, where binary search would be far faster.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Linear search is looking for 8 and has just found that index 1 (value 3) is not a match. What happens next?',
      view: linearSearchSteps([14, 3, 27, 8, 19], 8)[2]!.view,
      options: ['It checks index 2 (value 27)', 'It jumps to index 3 (value 8)', 'It returns −1', 'It starts again from index 0'],
      answer: 0,
      explanation: 'Linear search has no way to know where 8 is, so it moves exactly one position to the right.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the worst-case time complexity of linear search on n items?',
      options: ['O(n)', 'O(1)', 'O(log n)', 'O(n²)'],
      answer: 0,
      explanation: 'If the target is last or absent, every one of the n items is compared once.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this return?',
      code: `linearSearch([7, 2, 9, 2, 5], 2);`,
      options: ['1', '3', '2', '-1'],
      answer: 0,
      explanation: 'The search returns as soon as it finds a match, so it reports the first 2, at index 1.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'When is linear search the right choice?',
      options: [
        'Searching a small unsorted list once',
        'Searching a sorted list of a million items many times',
        'Finding the shortest path in a graph',
        'Keeping items in sorted order',
      ],
      answer: 0,
      explanation: 'For small or one-off searches on unsorted data, the simplicity of linear search wins.',
    },
  ],
  summary: [
    'Linear search checks items one by one from the start.',
    'It works on any data in any order and needs no extra memory.',
    'Its cost is O(n): the work grows in direct proportion to the number of items.',
    'If the data is sorted, binary search is dramatically faster.',
  ],
};

export default content;
