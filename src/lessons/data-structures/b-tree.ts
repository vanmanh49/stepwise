import { bTreeStructure } from '../../data-structures/bTree';
import type { Lesson } from '../../types/lesson';

export const bTree: Lesson = {
  id: 'b-tree',
  title: 'B-Tree / B+ Tree',
  category: 'data-structures',
  difficulty: 'advanced',
  description: 'A wide, shallow search tree with many keys per node, built for disks and databases.',
  keywords: ['b tree', 'b+ tree', 'bplus tree', 'multiway tree', 'database index', 'split', 'merge', 'borrow', 'order', 'disk page'],
  prerequisites: ['binary-search-tree'],
  overview:
    'A B-tree is a search tree where each node holds several sorted keys and has one more child than it has keys. Because each node branches many ways, the tree is very shallow: a few levels can hold millions of keys. Databases and file systems use B-trees because reading one node costs one disk read, so fewer levels means fewer slow reads.',
  concept: [
    'A node with keys [10, 20] has three children: one for keys below 10, one for keys between 10 and 20, and one for keys above 20. Searching compares within the node, then goes down into the one child that can hold the key.',
    'The tree has an order: here 4, so a node holds 1 to 3 keys. Nodes split when they get too full and borrow or merge when they get too empty. The tree only grows or shrinks at the root, so every leaf is always at the same depth. That is what keeps it balanced.',
    'A B+ tree is the variant databases use for indexes. All the data lives in the leaves, inner nodes hold only copies of keys to guide the search, and the leaves are linked left to right so a range can be read by walking along them. The SQL Indexes lesson shows a B+ tree at work.',
  ],
  howItWorks: [
    'Search: in each node, find the first key not smaller than the target. If it is equal, the key is found; otherwise go down into the child just before it.',
    'Insert: walk down to a leaf and add the key in order. A node with 4 keys splits: the third key moves up into the parent and the rest form two nodes. A root split adds a new root.',
    'Delete from a leaf: remove the key. A key in an inner node is replaced by its predecessor (the largest key to its left), which is removed from its leaf.',
    'A node left with no keys borrows a key through the parent from a sibling that has more than one.',
    'If no sibling can spare a key, it merges with a sibling, pulling the separator down from the parent. That can empty the parent, so the fix repeats upwards.',
    'If the root ends up with no keys, its only child becomes the root and the tree gets one level shorter.',
  ],
  visualization: { kind: 'structure', structure: bTreeStructure },
  code: bTreeStructure.code,
  complexity: {
    rows: [
      { label: 'Search', best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
      { label: 'Insert', best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' },
      { label: 'Delete', best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' },
    ],
    space: 'O(n)',
    note: 'With up to m children per node, the height is about logₘ n. Real databases use nodes of hundreds of keys, so a billion keys fit in 4 or 5 levels. Work inside a node is small compared with reading it from disk.',
    curves: ['log'],
  },
  compareWith: ['binary-search-tree', 'red-black-tree'],
  prosCons: {
    pros: ['Very shallow, so few node reads per operation', 'Always balanced: all leaves at the same depth', 'Keeps keys sorted, so range queries are efficient (especially in a B+ tree)'],
    cons: ['More complex than binary trees, with splits, borrows and merges', 'Nodes may be partly empty, wasting some space', 'For small in-memory data, a balanced binary tree or hash table is simpler'],
    useWhen: ['Data lives on disk or SSD and reads come in pages', 'You build a database or file-system index', 'You need sorted order and range scans over large data'],
    avoidWhen: ['Everything fits in memory and is small', 'You only need exact-match lookups (a hash index is simpler)'],
  },
  applications: [
    'Database indexes in PostgreSQL, MySQL and SQLite (as B+ trees)',
    'File systems such as NTFS, ext4, Btrfs and APFS',
    'Key-value stores and the storage engines under many databases',
  ],
  commonMistakes: [
    'Splitting a node before it actually overflows, or moving the wrong key up.',
    'Merging when a sibling could have lent a key, which makes the tree shrink sooner than needed.',
    'Forgetting to move a child pointer along with the borrowed key when the nodes are not leaves.',
    'Mixing up a B-tree, where inner nodes hold real keys, with a B+ tree, where all data is in the linked leaves.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You insert 8 into this B-tree of order 4. What happens?',
      view: bTreeStructure.view(bTreeStructure.initial),
      options: ['The leaf [5 6 7 8] splits and 7 moves up into the root', 'The root splits', 'Nothing else: 8 fits in its leaf', '8 goes into the root'],
      answer: 0,
      explanation: '8 is smaller than 10, so it goes to the first leaf, which becomes [5 6 7 8]: one key too many. It splits into [5 6] and [8], and 7 moves up. The root becomes [7 10 20], which still fits.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'Each node has up to m children. About how many levels does a B-tree of n keys have?',
      options: ['logₘ n', 'log₂ n', 'n / m', 'm'],
      answer: 0,
      explanation: 'Each level multiplies the number of reachable keys by up to m, so the height is about logₘ n. With m in the hundreds, that is only a few levels.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why are all leaves of a B-tree always at the same depth?',
      options: [
        'The tree only grows by splitting the root and only shrinks by removing it',
        'Leaves are rebalanced with rotations',
        'New keys are always added at the root',
      ],
      answer: 0,
      explanation: 'Splits and merges change the number of nodes on a level, but a new level only ever appears or disappears at the top, which changes every path at once.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'The tree is root [10] with leaves [5] and [20]. After this call, what is the tree?',
      code: `remove(tree, 20);`,
      options: ['A single leaf [5 10]', 'Root [5] with leaves [] and [10]', 'Root [10] with leaf [5]', 'A single leaf [5]'],
      answer: 0,
      explanation: 'The leaf [20] becomes empty. Its sibling [5] has no key to spare, so they merge with the separator 10 pulled down: [5 10]. The root is now empty, so the merged leaf becomes the root.',
    },
  ],
  summary: [
    'A B-tree node holds several sorted keys and has one more child than keys.',
    'Full nodes split and push a key up; empty nodes borrow from a sibling or merge.',
    'The tree only grows and shrinks at the root, so it is always perfectly balanced.',
    'B+ trees keep all data in linked leaves and power most database indexes.',
  ],
};
