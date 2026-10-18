import { arrayStructure } from '../../data-structures/array';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'An array stores values in a row of numbered slots. Because the slots sit next to each other in memory, the computer can jump straight to any index, but adding or removing a value in the middle means moving its neighbours.',
  concept: [
    'Picture a row of lockers numbered 0, 1, 2, and so on. If you know the number, you walk straight to the locker. You never have to open the others first. That is what makes reading from an array so fast.',
    'The cost of that speed is rigidity. The lockers must stay in one unbroken row, so squeezing a new value into the middle forces every later value to shift one slot to the right, and deleting one forces them to shift back.',
    'Almost every other data structure is built on top of arrays or designed to avoid their weaknesses, which is why they come first.',
  ],
  howItWorks: [
    'Access: compute the slot position from the index and read it. One step, whatever the size.',
    'Update: jump to the index and overwrite the value. Also one step.',
    'Insert: shift every value from the insert position onward one slot right, then write the new value into the gap.',
    'Delete: remove the value, then shift every later value one slot left to close the gap.',
    'Search: without extra knowledge about the order, check each slot in turn until the value is found.',
  ],
  visualization: { kind: 'structure', structure: arrayStructure },
  code: arrayStructure.code,
  prosCons: {
    pros: ['Instant access to any position', 'Compact: no extra memory per value', 'Fast to loop over because neighbours sit together in memory'],
    cons: ['Inserting or deleting in the middle is slow', 'Searching unsorted data means checking every slot', 'Growing past capacity requires copying everything'],
    useWhen: ['You mostly read or update by position', 'You add and remove at the end', 'You need to loop over all values often'],
    avoidWhen: ['You frequently insert or delete at the front or middle', 'You need to find values by key rather than by position'],
  },
  applications: [
    'Pixels of an image, stored row by row',
    'Rows returned by a database query',
    'The backing storage for stacks, queues, heaps and hash tables',
    'Lookup tables such as the days in each month',
  ],
  commonMistakes: [
    'Off-by-one errors: the last valid index is length − 1, not length.',
    'Assuming insert is cheap everywhere. Inserting at the front of a large array inside a loop quietly becomes O(n²).',
    'Deleting items while looping forward over the same array, which skips the value that slides into the deleted slot.',
    'Confusing an index (a position) with the value stored there.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'complexity',
      prompt: 'What is the time complexity of reading the value at index 500 in an array of 1,000,000 values?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
      answer: 0,
      explanation: 'The slot position is calculated directly from the index, so the size of the array does not matter.',
    },
    {
      id: 'q2',
      type: 'predict-next',
      prompt: 'You insert 15 at index 1 of this array. What has to happen first?',
      view: arrayStructure.view([10, 20, 30, 40, 50]),
      options: [
        '20, 30, 40 and 50 each shift one slot to the right',
        '10 shifts one slot to the left',
        '15 overwrites 20',
        'Only 20 moves, to the end of the array',
      ],
      answer: 0,
      explanation: 'Slots must stay contiguous, so every value from index 1 onward moves right to open a gap for 15.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this print?',
      code: `const items = [4, 8, 15, 16];\nitems.splice(1, 1);\nconsole.log(items[1], items.length);`,
      options: ['15 3', '8 3', '15 4', 'undefined 3'],
      answer: 0,
      explanation: 'splice(1, 1) deletes the 8. The later values shift left, so index 1 now holds 15 and the length drops to 3.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which task is an array a poor fit for?',
      options: [
        'Repeatedly adding items at the front of a long list',
        'Reading the 10th item many times',
        'Looping over every item once',
        'Adding items at the end',
      ],
      answer: 0,
      explanation: 'Every insert at the front shifts all existing values, costing O(n) each time.',
    },
  ],
  summary: [
    'An array is a contiguous row of slots addressed by index, starting at 0.',
    'Access and update are O(1); search is O(n) unless the data is sorted.',
    'Insert and delete cost O(n) in the middle because values must shift, and O(1) at the end.',
    'Choose an array when you read by position far more often than you insert in the middle.',
  ],
};

export default content;
