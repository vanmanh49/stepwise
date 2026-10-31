import { heapSortCode, heapSortSteps } from '../../algorithms/sorting/heap';
import type { LessonContent } from '../../types/lesson';
import type { Step } from '../../types/visualization';

const sample = heapSortSteps([4, 10, 3, 5, 1, 8]);
const heapBuilt = sample.find((s: Step) => s.title.startsWith('The max-heap is built'))!;

const content: LessonContent = {
  overview:
    'Heap sort sorts an array by first arranging it as a max-heap, which puts the largest value at the front. It then swaps that value to the end, shrinks the heap by one, repairs it, and repeats. It runs in O(n log n) in every case and needs no extra memory.',
  concept: [
    'Selection sort repeatedly finds the largest remaining value and puts it in place, but each search scans everything that is left: O(n) per round. Heap sort is the same plan with a better search.',
    'A max-heap always has its largest value at the root, and after removing the root it can be repaired in O(log n) by sifting one value down. So "find the largest remaining value" drops from O(n) to O(log n).',
    'The clever part is that the heap lives inside the array being sorted. The front of the array is the heap and the back is the sorted section. Each round the heap shrinks by one slot and the sorted section grows by one.',
  ],
  howItWorks: [
    'Build a max-heap: starting from the last node that has a child and moving back to the root, sift each node down.',
    'The largest value is now at index 0.',
    'Swap it with the last item of the heap. That item is now in its final position.',
    'Shrink the heap by one, so the sorted item is left alone.',
    'Sift the new root down to repair the heap.',
    'Repeat until the heap has one item left.',
  ],
  visualization: { kind: 'sort', initial: [4, 10, 3, 5, 1, 8], generate: heapSortSteps },
  code: heapSortCode,
  prosCons: {
    pros: ['Guaranteed O(n log n), with no worst-case input', 'Sorts in place: O(1) extra memory', 'No recursion needed'],
    cons: ['Not stable: equal values can change order', 'Slower than quick sort in practice, because it jumps around in memory', 'Does not benefit from input that is already nearly sorted'],
    useWhen: ['You need a guaranteed worst case and cannot spare extra memory', 'You only need the largest few values: stop after k rounds'],
    avoidWhen: ['Equal items must keep their original order (use merge sort)', 'Average speed matters most (quick sort is usually faster)'],
  },
  applications: [
    'Introsort, used by C++ and others, falls back to heap sort when quick sort starts to degrade',
    'Systems with tight memory limits, such as embedded devices',
    'Finding the k largest items without sorting everything',
    'Real-time systems that need a predictable worst case',
  ],
  commonMistakes: [
    'Sifting down across the whole array instead of only the shrinking heap, which pulls sorted values back in.',
    'Building the heap by sifting from the root downward. It must start from the last parent and work back.',
    'Using a min-heap and ending up with descending order.',
    'Assuming it is stable.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The max-heap has just been built. What does heap sort do next?',
      view: heapBuilt.view,
      options: [
        'Swaps the root with the last item, putting the largest value in its final place',
        'Swaps the two smallest values, so the sorted part starts at the front',
        'Rebuilds the whole heap from the bottom up before it moves anything',
        'Reverses the whole array',
      ],
      answer: 0,
      explanation: 'The root holds the largest value, and in sorted order the largest value belongs at the end. After the swap the heap shrinks by one.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the worst-case time complexity of heap sort?',
      options: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'],
      answer: 0,
      explanation: 'There are n rounds and each sift-down follows at most log₂ n levels. No input makes it worse.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What advantage does heap sort have over merge sort?',
      options: [
        'It sorts in place, using O(1) extra memory',
        'It is stable',
        'It is faster on nearly sorted input',
        'It has a better worst-case time complexity',
      ],
      answer: 0,
      explanation: 'Both are O(n log n) in the worst case, but merge sort needs an O(n) buffer. Heap sort is not stable, though.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'The loop that builds the heap starts at this index. For an array of 6 items, which index is that, and why?',
      code: `for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {\n  siftDown(arr, i, n);\n}`,
      options: [
        'Index 2: it is the last node that has a child',
        'Index 5: it is the last item',
        'Index 0: it is the root',
        'Index 3: it is the middle of the array',
      ],
      answer: 0,
      explanation: 'floor(6 / 2) − 1 = 2. Indexes 3, 4 and 5 are leaves, which are already valid one-node heaps, so there is nothing to sift.',
    },
  ],
  summary: [
    'Heap sort builds a max-heap, then repeatedly swaps the root to the end and repairs the heap.',
    'The heap and the sorted section share one array.',
    'It is O(n log n) in every case and uses O(1) extra memory.',
    'It is not stable and is usually a little slower than quick sort.',
  ],
};

export default content;
