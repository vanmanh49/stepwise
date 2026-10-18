import { avlStructure } from '../../data-structures/avl';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'An AVL tree is a binary search tree that never gets lopsided. Every node tracks how tall its two subtrees are, and after each insert or delete the tree checks the nodes on the way back up. When one side becomes two levels taller than the other, a rotation fixes it. The tree stays about log n tall, so search, insert and delete are always O(log n).',
  concept: [
    'A plain BST can degrade into a chain: insert 1, 2, 3, 4, 5 and every node hangs to the right, making searches O(n). An AVL tree prevents that with one rule: at every node, the heights of the left and right subtrees differ by at most 1.',
    'The balance factor of a node is its left height minus its right height. It must be -1, 0 or +1. An insert or delete only changes heights along one path, so only the nodes on that path need checking, from the bottom up.',
    'A rotation is a small local rearrangement that keeps the BST order but moves one node up and its parent down. A straight-line imbalance (LL or RR) needs one rotation. A zig-zag (LR or RL) needs two: the first turns it into a straight line, the second fixes it.',
  ],
  howItWorks: [
    'Insert or delete exactly as in a BST.',
    'Walk back up the path to the root. At each node, recompute its height and balance factor.',
    'Balance +2 with a left child leaning left (LL): rotate right at the node.',
    'Balance +2 with a left child leaning right (LR): rotate left at the child, then right at the node.',
    'Balance -2 is the mirror image: RR needs one left rotation, RL a right rotation at the child, then a left rotation at the node.',
    'After an insert, one fix restores the subtree\'s old height, so the walk can stop. After a delete, keep checking up to the root.',
  ],
  visualization: { kind: 'structure', structure: avlStructure },
  code: avlStructure.code,
  prosCons: {
    pros: ['Guaranteed O(log n) search, insert and delete', 'More strictly balanced than a red-black tree, so lookups are slightly faster', 'Keeps values in sorted order'],
    cons: ['More rotations on insert and delete than a red-black tree', 'Each node stores a height', 'More code than a plain BST'],
    useWhen: ['Lookups are much more frequent than changes', 'You need a worst-case guarantee, not just an average', 'You need sorted order and range queries'],
    avoidWhen: ['Changes are very frequent (a red-black tree rotates less)', 'You only need exact-match lookups (use a hash table)'],
  },
  applications: [
    'In-memory indexes where reads dominate, such as lookup tables in databases',
    'Ordered sets and maps that need guaranteed fast lookups',
    'Interval and range queries built on a balanced tree',
  ],
  commonMistakes: [
    'Updating the heights of the rotated nodes in the wrong order. The node that moves down must be updated first.',
    'Using one rotation for a zig-zag (LR or RL) case. It just moves the imbalance to the other side.',
    'Stopping the walk after the first fix when deleting. A delete can unbalance several ancestors.',
    'Computing heights by walking the subtree every time, which makes each operation O(n). Store them in the nodes.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You insert 50 into this AVL tree. Which node needs a rotation?',
      view: avlStructure.view([20, 10, 5, 15, 30, 40]),
      options: ['30', '40', '20', 'None'],
      answer: 0,
      explanation: '50 goes to the right of 40. Then 30 has no left child and a right subtree 2 levels tall: balance -2. It is a straight line (RR), so one left rotation at 30 makes 40 the parent of 30 and 50.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the worst-case time to search an AVL tree of n values?',
      options: ['O(log n)', 'O(n)', 'O(1)', 'O(n log n)'],
      answer: 0,
      explanation: 'The balance rule keeps the tree about log n tall, and a search walks one path from the root.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'A node has balance +2 and its left child has balance -1. What fixes it?',
      options: ['Rotate left at the child, then right at the node', 'One right rotation at the node', 'One left rotation at the node'],
      answer: 0,
      explanation: 'This is the LR zig-zag. A single right rotation would just make it lean the other way. Rotating the child first straightens it into an LL case, which one right rotation fixes.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Starting from an empty AVL tree, which value is at the root after this loop?',
      code: `for (const value of [1, 2, 3, 4, 5]) {\n  root = insert(root, value);\n}`,
      options: ['2', '1', '3', '5'],
      answer: 0,
      explanation: 'After 3, a left rotation makes 2 the root. Inserting 5 unbalances 3, and a left rotation at 3 makes 4 its parent. The root stays 2, with 1 on the left and 4 (with 3 and 5) on the right.',
    },
  ],
  summary: [
    'An AVL tree is a BST where each node\'s two subtree heights differ by at most 1.',
    'After an insert or delete, nodes on the path back up are checked and rotated if needed.',
    'Straight-line imbalances (LL, RR) take one rotation; zig-zags (LR, RL) take two.',
    'The tree stays about log n tall, so every operation is O(log n), even in the worst case.',
  ],
};

export default content;
