import { stackStructure } from '../../data-structures/stack';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A stack is a collection with one rule: the last item you put in is the first one you take out. You can push an item onto the top, pop the top item off, or peek at it. Everything below the top is out of reach until the items above it are gone.',
  concept: [
    'Picture a pile of plates. You add a clean plate on top and you take a plate from the top. Pulling one from the middle is not allowed. That restriction is the whole idea, and it is called LIFO: last in, first out.',
    'The restriction is useful because many problems have exactly this shape. When a function calls another function, the caller must wait until the callee finishes. When you press undo, the most recent change is reversed first.',
    'A stack is usually built on an array (push and pop at the end) or a linked list (insert and delete at the head). Both make every operation O(1).',
  ],
  howItWorks: [
    'Push: place the new item on top of the stack. It becomes the new top.',
    'Pop: remove the top item and return it. The item beneath becomes the new top.',
    'Peek: return the top item without removing it.',
    'Empty check: before pop or peek, make sure the stack has at least one item.',
  ],
  visualization: { kind: 'structure', structure: stackStructure },
  code: stackStructure.code,
  prosCons: {
    pros: ['Every core operation is O(1)', 'Very simple to implement and reason about', 'Naturally reverses order'],
    cons: ['Only the top item is reachable', 'No searching or random access without emptying it'],
    useWhen: ['The most recent item must be handled first', 'You need to backtrack or undo', 'You are matching nested pairs such as brackets'],
    avoidWhen: ['Items must be handled in arrival order (use a queue)', 'You need to reach items in the middle'],
  },
  applications: [
    'The call stack that tracks which function is running and where to return',
    'Undo and redo in editors',
    'Back button history in a browser',
    'Checking that brackets in code are balanced',
    'Depth-first search',
  ],
  commonMistakes: [
    'Popping or peeking an empty stack without checking first (stack underflow).',
    'Mixing up the ends: with an array, push and pop must both use the same end.',
    'Using a stack when order of arrival matters. A stack reverses order; a queue preserves it.',
    'Recursing too deeply and overflowing the call stack, which is itself a stack with limited size.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You call pop() on this stack. Which value is returned?',
      view: stackStructure.view([10, 20, 30]),
      options: ['30', '10', '20', 'All of them'],
      answer: 0,
      explanation: '30 was pushed last, so it is on top and leaves first: last in, first out.',
    },
    {
      id: 'q2',
      type: 'code',
      prompt: 'What does this print?',
      code: `const stack: number[] = [];\nstack.push(1);\nstack.push(2);\nstack.pop();\nstack.push(3);\nconsole.log(stack);`,
      options: ['[1, 3]', '[2, 3]', '[1, 2, 3]', '[3, 1]'],
      answer: 0,
      explanation: 'After pushing 1 and 2, pop removes 2 (the top). Pushing 3 then gives [1, 3].',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'A stack holds 1,000,000 items. What is the time complexity of push?',
      options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
      answer: 0,
      explanation: 'Push only touches the top, so the number of items below makes no difference.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which of these is naturally solved with a stack?',
      options: [
        'Checking that every ( has a matching )',
        'Serving customers in the order they arrived',
        'Finding the smallest value quickly',
        'Looking up a phone number by name',
      ],
      answer: 0,
      explanation: 'The most recently opened bracket must be closed first, which is exactly last in, first out.',
    },
  ],
  summary: [
    'A stack is last in, first out: push adds to the top, pop removes from the top.',
    'Push, pop and peek are all O(1).',
    'Only the top is reachable; anything else requires popping what is above it.',
    'Stacks appear wherever the latest thing must be finished first: function calls, undo, backtracking.',
  ],
};

export default content;
