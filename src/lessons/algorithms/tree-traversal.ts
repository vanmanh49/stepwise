import { traversalCode, traversalStructure } from '../../algorithms/tree/traversal';
import type { Lesson } from '../../types/lesson';

const sampleTree = traversalStructure.view(traversalStructure.initial);

export const treeTraversal: Lesson = {
  id: 'tree-traversal',
  title: 'Tree Traversal',
  category: 'algorithms',
  difficulty: 'intermediate',
  group: 'Tree Algorithms',
  description: 'Four standard orders for visiting every node of a tree exactly once.',
  keywords: ['preorder', 'inorder', 'postorder', 'level order', 'tree', 'recursion', 'dfs', 'bfs', 'visit'],
  prerequisites: ['binary-tree', 'stack', 'queue'],
  overview:
    'Traversing a tree means visiting every node once. A list has one obvious order, but a tree branches, so you need a rule for what comes next. There are four standard rules: preorder, inorder, postorder and level order. They visit the same nodes in different sequences, and each sequence is useful for different jobs.',
  concept: [
    'At every node there are three things to do: visit the node itself, handle its left subtree, and handle its right subtree. The three depth-first traversals differ only in when the node is visited relative to its subtrees.',
    'Preorder visits the node before its subtrees. Inorder visits it between them. Postorder visits it after both. The prefix tells you where the node goes: pre = before, in = in between, post = after.',
    'These three are naturally recursive: "handle the left subtree" means running the same rule on a smaller tree. The call stack remembers which nodes are still waiting.',
    'Level order is different. It goes across the tree one level at a time, and uses a queue instead of recursion. It is breadth-first search applied to a tree.',
  ],
  howItWorks: [
    'Preorder: visit the node, then traverse its left subtree, then its right subtree.',
    'Inorder: traverse the left subtree, visit the node, then traverse the right subtree.',
    'Postorder: traverse the left subtree, then the right subtree, then visit the node.',
    'Level order: put the root in a queue; repeatedly take the front node, visit it, and add its children to the back.',
    'In every case, an empty subtree is the base case: there is nothing to do, so return.',
  ],
  visualization: { kind: 'structure', structure: traversalStructure },
  code: traversalCode,
  complexity: {
    rows: [
      { label: 'Preorder', best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
      { label: 'Inorder', best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
      { label: 'Postorder', best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
      { label: 'Level order', best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
    ],
    space: 'O(h) or O(w)',
    note: 'Every traversal visits each node once, so all four are O(n). Memory differs: the recursive ones keep one call per level on the stack, so they need O(h) where h is the height of the tree. Level order keeps a whole level in its queue, so it needs O(w) where w is the widest level.',
    curves: ['n'],
  },
  compareWith: ['bfs', 'dfs'],
  prosCons: {
    pros: ['Each is a few lines of code', 'Together they cover almost every way a tree needs to be processed', 'All run in linear time'],
    cons: ['Deep, lopsided trees can overflow the call stack in the recursive versions', 'Level order can use a lot of memory on very wide trees', 'Picking the wrong order gives a correct-looking but wrong result'],
    useWhen: ['Preorder: copying a tree or saving it to a file (parents before children)', 'Inorder: reading a binary search tree in sorted order', 'Postorder: deleting a tree or computing sizes (children before parents)', 'Level order: anything organised by depth, or finding the shallowest match'],
    avoidWhen: ['You only need one path from root to a leaf, such as a BST search: a full traversal is wasted work'],
  },
  applications: [
    'Inorder traversal of a binary search tree lists its values in sorted order',
    'Postorder evaluates expression trees: compute both operands before applying the operator',
    'Preorder serialises a tree so it can be rebuilt later',
    'Level order prints an organisation chart rank by rank',
  ],
  commonMistakes: [
    'Mixing up the three depth-first orders. Remember where the node goes: before, in between, or after.',
    'Forgetting the base case for an empty subtree, which crashes on the first leaf.',
    'Using a stack where level order needs a queue, which turns it into a depth-first walk.',
    'Expecting inorder to give sorted output on a tree that is not a binary search tree.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'An inorder traversal runs on this tree. Which node is visited first?',
      view: sampleTree,
      options: ['4', '1', '2', '7'],
      answer: 0,
      explanation: 'Inorder handles the left subtree before the node, at every level. Following left children from the root leads to 4, which has no left child, so it is visited first.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which traversal visits a node only after both of its subtrees are finished?',
      options: ['Postorder', 'Preorder', 'Inorder', 'Level order'],
      answer: 0,
      explanation: 'Post means after. That is why postorder is used to delete trees or to total up sizes: children are done before their parent.',
    },
    {
      id: 'q3',
      type: 'predict-next',
      prompt: 'What is the preorder traversal of this tree?',
      view: sampleTree,
      options: ['1, 2, 4, 5, 3, 6, 7', '4, 2, 5, 1, 6, 3, 7', '4, 5, 2, 6, 7, 3, 1', '1, 2, 3, 4, 5, 6, 7'],
      answer: 0,
      explanation: 'Preorder visits the node, then everything on its left, then everything on its right: 1, then the subtree under 2 (2, 4, 5), then the subtree under 3 (3, 6, 7).',
    },
    {
      id: 'q4',
      type: 'complexity',
      prompt: 'What is the time complexity of a level-order traversal of a tree with n nodes?',
      options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(n²)'],
      answer: 0,
      explanation: 'Each node enters and leaves the queue exactly once.',
    },
    {
      id: 'q5',
      type: 'code',
      prompt: 'The tree has root 2 with left child 1 and right child 3. What does this print?',
      code: `const out: number[] = [];\npostorder(root, (v) => out.push(v));\nconsole.log(out);`,
      options: ['[1, 3, 2]', '[2, 1, 3]', '[1, 2, 3]', '[3, 1, 2]'],
      answer: 0,
      explanation: 'Postorder is left, right, node: 1, then 3, then the root 2.',
    },
  ],
  summary: [
    'A traversal is a rule for visiting every node of a tree once.',
    'Preorder, inorder and postorder differ only in when the node is visited relative to its subtrees.',
    'Level order goes across each level using a queue.',
    'All four take O(n) time; they differ in memory use and in what the order is good for.',
  ],
};
