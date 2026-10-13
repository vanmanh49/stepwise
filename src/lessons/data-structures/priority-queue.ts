import { priorityQueueStructure } from '../../data-structures/priorityQueue';
import type { Lesson } from '../../types/lesson';

export const priorityQueue: Lesson = {
  id: 'priority-queue',
  title: 'Priority Queue',
  category: 'data-structures',
  difficulty: 'intermediate',
  description: 'A queue where the most urgent item leaves first, not the oldest.',
  keywords: ['min heap', 'heap', 'priority', 'urgent', 'scheduler', 'enqueue', 'dequeue'],
  prerequisites: ['queue', 'heap'],
  overview:
    'A priority queue hands back items in order of priority instead of order of arrival. You can add an item with any priority at any time, and removing always gives you the most urgent one. It is almost always built on a heap, which makes both operations fast.',
  concept: [
    'Think of a hospital emergency room. Patients are not treated in the order they walk in; the most serious case goes first. A newly arrived critical patient jumps ahead of everyone who is less urgent.',
    'A priority queue is defined by what it does, not how it is built: add an item, and remove the most urgent item. In this lesson a smaller number means more urgent, so the queue is backed by a min-heap.',
    'You could build one with a sorted array, but every insert would shift items: O(n). You could use an unsorted list, but every removal would scan for the minimum: O(n). A heap gives O(log n) for both, which is why it is the standard choice.',
  ],
  howItWorks: [
    'Enqueue: place the new item at the end of the heap array, then swap it upward while it is more urgent than its parent.',
    'Dequeue: the most urgent item is at the root. Take it, move the last item into the root, then swap that item downward with its more urgent child until order is restored.',
    'Peek: read the root without removing it.',
    'Items with equal priority may leave in any order unless you add a tie-breaker such as an arrival counter.',
  ],
  visualization: { kind: 'structure', structure: priorityQueueStructure },
  code: priorityQueueStructure.code,
  complexity: {
    rows: [
      { label: 'Enqueue', best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
      { label: 'Dequeue', best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
      { label: 'Peek', best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
      { label: 'Find an arbitrary item', best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
    ],
    space: 'O(n)',
    note: 'Both enqueue and dequeue follow a single path between the root and a leaf of the heap, and a heap of n items has about log₂ n levels. With a million items waiting, each operation needs at most about 20 swaps.',
    curves: ['1', 'log'],
  },
  compareWith: ['queue', 'heap'],
  prosCons: {
    pros: ['Always gives the most urgent item in O(1) to read, O(log n) to remove', 'Items can be added in any order at any time', 'Compact: stored in a single array'],
    cons: ['No fast way to find or change an arbitrary item', 'Equal priorities are not guaranteed to keep arrival order', 'Slower than a plain queue when order of arrival is all you need'],
    useWhen: ['Work must be handled by urgency, cost or time rather than arrival', 'You repeatedly need the smallest or largest remaining item'],
    avoidWhen: ['Plain first-in, first-out is enough (use a queue)', 'You need to look items up by key (use a hash table)'],
  },
  applications: [
    'Operating system schedulers choosing which task runs next',
    "Dijkstra's shortest path and Prim's minimum spanning tree",
    'Event simulations: always process the event with the earliest time',
    'Merging many sorted files or streams',
  ],
  commonMistakes: [
    'Expecting items with the same priority to come out in arrival order. Add a counter as a tie-breaker if that matters.',
    'Mixing up min and max. Decide whether a small number or a large number means "urgent" and stick to it.',
    'Changing an item\'s priority inside the heap without re-sifting it.',
    'Using a sorted array and paying O(n) on every insert.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Smaller numbers are more urgent. You call dequeue() on this priority queue. Which value is returned?',
      view: priorityQueueStructure.view([2, 5, 3, 9, 7]),
      options: ['2', '9', '7', '5'],
      answer: 0,
      explanation: 'The most urgent item is always at the root of the min-heap, which is 2. Arrival order plays no part.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'How does a priority queue differ from an ordinary queue?',
      options: [
        'Items leave by priority instead of by arrival order',
        'It can hold more items',
        'Items can only be added at the front',
        'It keeps every item fully sorted at all times',
      ],
      answer: 0,
      explanation: 'An ordinary queue is first in, first out. A priority queue serves the most urgent item first. It does not need to be fully sorted to do so.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'A heap-based priority queue holds n items. What is the cost of enqueue in the worst case?',
      options: ['O(log n)', 'O(1)', 'O(n)', 'O(n log n)'],
      answer: 0,
      explanation: 'The new item may sift up from the bottom level to the root, one swap per level, and there are about log₂ n levels.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Smaller numbers are more urgent. What does this print?',
      code: `const pq = new PriorityQueue();\npq.enqueue(4);\npq.enqueue(1);\npq.enqueue(3);\npq.dequeue();\nconsole.log(pq.peek());`,
      options: ['3', '1', '4', 'undefined'],
      answer: 0,
      explanation: 'dequeue removes 1, the most urgent. Of the remaining 4 and 3, the more urgent is 3, so peek returns 3.',
    },
  ],
  summary: [
    'A priority queue removes the most urgent item first, regardless of arrival order.',
    'It is usually built on a heap: enqueue and dequeue are O(log n), peek is O(1).',
    'A sorted array or unsorted list would make one of the operations O(n).',
    'It powers schedulers, simulations and graph algorithms such as Dijkstra.',
  ],
};
