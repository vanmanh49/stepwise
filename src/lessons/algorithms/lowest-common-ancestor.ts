import { lcaCode, lcaStructure } from '../../algorithms/tree/lca';
import { build, treeView } from '../../data-structures/bst';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'The lowest common ancestor (LCA) of two nodes is the deepest node that has both of them below it. In a binary search tree there is a neat shortcut: start at the root and keep moving toward both values. The first node where they would go different ways is the answer.',
  concept: [
    'Think of a family tree. Two cousins share grandparents, great-grandparents and so on, but the lowest common ancestor is the closest one: the grandparents. In a tree data structure, the LCA of two nodes is the deepest node whose subtree contains both. A node counts as its own ancestor, so the LCA of a node and its child is the node itself.',
    'In a general tree you would have to search for both nodes. A binary search tree gives you directions for free: values smaller than a node are on its left and larger ones on its right. If both values are smaller than the current node, their common ancestor must be further left. If both are larger, it must be further right.',
    'The moment the two values are on different sides, or one of them is the current node, the paths to them split right here. No deeper node can contain both, so this node is the lowest common ancestor.',
  ],
  howItWorks: [
    'Start at the root.',
    'If both values are smaller than the current node, move to the left child.',
    'If both values are larger than the current node, move to the right child.',
    'Otherwise the values split here, or one of them is this node: the current node is the lowest common ancestor.',
    'Check first that both values are in the tree; otherwise there is no answer.',
  ],
  visualization: { kind: 'structure', structure: lcaStructure },
  code: lcaCode,
  prosCons: {
    pros: ['One walk from the root, no searching both sides', 'Constant extra memory', 'Very short code'],
    cons: ['Relies on the binary search tree ordering', 'Slow on an unbalanced, chain-like tree'],
    useWhen: ['The tree is a binary search tree', 'You answer a few LCA queries on a balanced tree'],
    avoidWhen: ['The tree is not ordered (use a general LCA method)', 'You answer millions of queries on one fixed tree (precompute with binary lifting)'],
  },
  applications: [
    'Finding the most specific shared category of two items in a hierarchy',
    'Distance between two nodes: depth(a) + depth(b) − 2 × depth(LCA)',
    'Merging changes in version control, where the common ancestor commit is the merge base',
    'Routing in tree-shaped networks',
  ],
  commonMistakes: [
    'Forgetting that a node can be its own ancestor, so LCA(10, 14) is 10 when 14 is below 10.',
    'Not checking that both values exist, and returning a node for a value that is not in the tree.',
    'Using this shortcut on a tree that is not a binary search tree.',
    'Comparing with <= and >=, which walks past the split point when a value equals the node.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Looking for LCA(1, 6) in this tree, the walk is at the root 8. Where does it go next?',
      view: treeView(build([8, 3, 1, 6, 10, 14]), { 8: 'compare', 1: 'frontier', 6: 'frontier' }),
      options: ['To 3, the left child', 'To 10, the right child', 'It stops: 8 is the answer', 'Back up to the parent'],
      answer: 0,
      explanation: 'Both 1 and 6 are smaller than 8, so they are both in the left subtree. The common ancestor must be there too.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'In the tree 8, 3, 1, 6, 10, 14, what is LCA(10, 14)?',
      options: ['10', '8', '14', 'There is none'],
      answer: 0,
      explanation: '14 is in the subtree of 10, and a node counts as its own ancestor, so the answer is 10.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What does finding the LCA in a balanced binary search tree with n nodes cost?',
      options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(1)'],
      answer: 0,
      explanation: 'The walk follows a single path down from the root, and a balanced tree has height about log n.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Which value does this call return?',
      code: '// tree: 8, 3, 1, 6, 10, 14\nlca(root, 1, 14).value;',
      options: ['8', '3', '10', '1'],
      answer: 0,
      explanation: '1 is smaller than 8 and 14 is larger, so they split at the root.',
    },
  ],
  summary: [
    'The lowest common ancestor is the deepest node with both values in its subtree.',
    'In a binary search tree, move left while both values are smaller and right while both are larger.',
    'The node where they split, or that equals one of them, is the answer.',
    'It costs the height of the tree: O(log n) when balanced.',
  ],
};

export default content;
