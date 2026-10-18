import { bstStructure } from '../../data-structures/bst';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A binary search tree (BST) stores values in nodes that each have up to two children. One rule holds everywhere: smaller values go left, larger values go right. That rule lets every comparison throw away an entire branch, so finding, adding and removing values stays fast as the tree grows.',
  concept: [
    'Start at the top node, the root. To find a value, compare it with the node you are on. If it is smaller, the answer can only be in the left subtree. If it is larger, only in the right. One comparison rules out everything on the other side.',
    'This is binary search turned into a shape. A sorted array also supports binary search, but inserting into it means shifting values. A BST inserts by attaching one new node, with no shifting at all.',
    'The catch is balance. If values arrive already sorted, every node goes to the right and the tree degrades into a linked list, with O(n) operations. Self-balancing trees such as AVL and red-black trees exist to prevent that.',
  ],
  howItWorks: [
    'Search: compare with the current node; go left if smaller, right if larger, stop if equal or if you run out of nodes.',
    'Insert: search for the value. The empty spot where the search ends is exactly where the new node belongs.',
    'Delete a leaf: just remove it.',
    'Delete a node with one child: let that child take its place.',
    'Delete a node with two children: copy in its inorder successor (the smallest value in its right subtree), then delete the successor from below.',
    'Inorder traversal: visit the left subtree, then the node, then the right subtree. This reads every value in ascending order.',
  ],
  visualization: { kind: 'structure', structure: bstStructure },
  code: bstStructure.code,
  prosCons: {
    pros: ['Search, insert and delete are all O(log n) when balanced', 'Keeps values in sorted order at all times', 'Supports range queries and finding the next larger or smaller value'],
    cons: ['Degrades to O(n) if it becomes unbalanced', 'Uses more memory than an array (two pointers per node)', 'Slower than a hash table for plain lookups'],
    useWhen: ['You need fast lookups and the data changes often', 'You need values in sorted order or by range', 'You need the nearest value above or below a key'],
    avoidWhen: ['You only need exact-match lookups (a hash table is simpler)', 'Input arrives sorted and the tree does not self-balance'],
  },
  applications: [
    'Database and file system indexes (as balanced variants such as B-trees)',
    'Sorted maps and sets in standard libraries',
    'Autocomplete and range queries such as "all orders between two dates"',
    'Leaderboards that need rank lookups',
  ],
  commonMistakes: [
    'Checking the BST rule only against the direct parent. Every node in the left subtree must be smaller, not just the left child.',
    'Forgetting the two-children case when deleting.',
    'Inserting sorted data into a plain BST and being surprised by O(n) performance.',
    'Not deciding how duplicates are handled. This lesson ignores them.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You insert 5 into this tree. Where does it end up?',
      view: bstStructure.view([8, 3, 1, 6, 10, 14]),
      options: ['As the left child of 6', 'As the right child of 3', 'As the left child of 10', 'As the right child of 1'],
      answer: 0,
      explanation: '5 < 8 so go left to 3. 5 > 3 so go right to 6. 5 < 6 and 6 has no left child, so 5 attaches there.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the worst-case time complexity of searching a BST that is not self-balancing?',
      options: ['O(n)', 'O(log n)', 'O(1)', 'O(n log n)'],
      answer: 0,
      explanation: 'If values were inserted in sorted order, the tree is a single chain and the search may visit every node.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Which traversal of a BST visits the values in ascending order?',
      options: ['Inorder (left, node, right)', 'Preorder (node, left, right)', 'Postorder (left, right, node)', 'Level order'],
      answer: 0,
      explanation: 'Everything smaller is on the left and everything larger is on the right, so left, node, right yields sorted order.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Values are inserted into an empty BST in this order. What is the height of the tree (number of levels)?',
      code: `for (const value of [1, 2, 3, 4, 5]) {\n  root = insert(root, value);\n}`,
      options: ['5', '3', '2', '1'],
      answer: 0,
      explanation: 'Each value is larger than all before it, so each becomes the right child of the previous one: a chain 5 levels tall.',
    },
  ],
  summary: [
    'In a BST, every value in a left subtree is smaller than its node and every value in a right subtree is larger.',
    'Each comparison discards a whole subtree, giving O(log n) operations on a balanced tree.',
    'An unbalanced tree can be as slow as a linked list: O(n).',
    'An inorder traversal reads the values in sorted order.',
  ],
};

export default content;
