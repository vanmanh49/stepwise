import { queueStructure } from '../../data-structures/queue';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A queue is a collection where items leave in the same order they arrived. You enqueue at the rear and dequeue from the front, exactly like a line at a shop. Whoever has waited longest is served next.',
  concept: [
    'A queue has two ends with different jobs. New items join at the rear. Items leave from the front. This rule is called FIFO: first in, first out.',
    'Where a stack reverses order, a queue preserves it. That makes a queue the right tool whenever fairness or arrival order matters: print jobs, network packets, tasks waiting for a worker.',
    'A plain array makes a poor queue, because removing from the front shifts every other item. Real queues use a linked list or a circular buffer so that both ends are O(1).',
  ],
  howItWorks: [
    'Enqueue: add the new item behind the current rear. It becomes the new rear.',
    'Dequeue: remove the item at the front and return it. The next item becomes the front.',
    'Peek: return the front item without removing it.',
    'Empty check: before dequeue or peek, make sure the queue has at least one item.',
  ],
  visualization: { kind: 'structure', structure: queueStructure },
  code: queueStructure.code,
  prosCons: {
    pros: ['Preserves arrival order', 'Enqueue and dequeue are O(1) with the right implementation', 'Decouples whoever produces work from whoever handles it'],
    cons: ['Only the front item is reachable', 'A naive array implementation makes dequeue O(n)'],
    useWhen: ['Items must be handled in the order they arrived', 'Work is produced faster than it can be handled and must wait', 'You are exploring level by level (BFS)'],
    avoidWhen: ['The newest item should be handled first (use a stack)', 'Items have priorities (use a priority queue)'],
  },
  applications: [
    'Print queues and task schedulers',
    'Message queues between services',
    'Buffering keystrokes or network packets',
    'Breadth-first search',
  ],
  commonMistakes: [
    'Dequeuing from an empty queue without checking first.',
    'Using array.shift() in a hot loop, which turns an O(n) job into O(n²).',
    'Adding and removing at the same end, which silently turns the queue into a stack.',
    'Confusing front and rear when reading code: items enter at the rear and exit at the front.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You call dequeue() on this queue. Which value is returned?',
      view: queueStructure.view([10, 20, 30, 40]),
      options: ['10', '40', '20', '30'],
      answer: 0,
      explanation: '10 is at the front. It arrived first, so it leaves first: first in, first out.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What does this print?',
      code: `const queue: number[] = [];\nqueue.push(1);\nqueue.push(2);\nqueue.shift();\nqueue.push(3);\nconsole.log(queue);`,
      options: ['[2, 3]', '[1, 3]', '[1, 2, 3]', '[3, 2]'],
      answer: 0,
      explanation: 'shift() removes 1 from the front, leaving [2]. Pushing 3 at the rear gives [2, 3].',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What is the main difference between a stack and a queue?',
      options: [
        'A stack removes the newest item; a queue removes the oldest',
        'A stack is faster than a queue',
        'A queue can hold more items',
        'A stack keeps its items sorted',
      ],
      answer: 0,
      explanation: 'Stack is LIFO and queue is FIFO. Both offer O(1) insert and remove.',
    },
    {
      id: 'q4',
      type: 'complexity',
      prompt: 'A queue is implemented with a plain array and dequeue uses shift(). What is the cost of one dequeue?',
      options: ['O(n)', 'O(1)', 'O(log n)', 'O(n²)'],
      answer: 0,
      explanation: 'shift() moves every remaining element one slot forward. A linked list or circular buffer avoids this.',
    },
  ],
  summary: [
    'A queue is first in, first out: enqueue at the rear, dequeue from the front.',
    'It preserves arrival order, where a stack reverses it.',
    'Enqueue, dequeue and peek are O(1) with a linked list or circular buffer.',
    'Queues are the engine behind schedulers, buffers and breadth-first search.',
  ],
};

export default content;
