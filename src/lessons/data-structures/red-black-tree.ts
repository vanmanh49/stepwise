import { redBlackStructure } from '../../data-structures/redBlack';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A red-black tree is a binary search tree where every node is coloured red or black. A few colour rules make sure no path from the root is more than twice as long as any other, so the tree stays about log n tall. After an insert or delete, the tree repairs the colours with recolouring and at most a few rotations. Many standard libraries use it for their sorted maps and sets.',
  concept: [
    'There are four rules: every node is red or black; the root is black; a red node never has a red child; and every path from a node down to an empty spot passes the same number of black nodes (its black height).',
    'Together, the rules limit how lopsided the tree can get. The shortest possible path is all black. The longest alternates black and red, so it is at most twice as long. That keeps the height under 2 × log₂ n.',
    'Compared with an AVL tree, the balance is looser, so a red-black tree rotates less when values are added and removed. Lookups may walk a slightly longer path. That trade-off suits structures that change often.',
  ],
  howItWorks: [
    'Insert as in a BST and colour the new node red. A red node never changes black heights, so only the "no red child of a red" rule can break.',
    'Red parent and red uncle: make both black and the grandparent red, then repeat the check at the grandparent.',
    'Red parent and black uncle in a zig-zag (triangle): rotate the parent to make a straight line. In a straight line: rotate the grandparent and swap the colours of the parent and grandparent.',
    'Finally, make the root black.',
    'Delete as in a BST. Removing a red node needs no fix. Removing a black node leaves its spot "double black": one black short.',
    'Fix a double black by its sibling: a red sibling is rotated to become black; a black sibling with black children is turned red and the problem moves up; a red child on the near side is rotated to the far side; a red child on the far side ends the fix with one rotation and recolouring.',
  ],
  visualization: { kind: 'structure', structure: redBlackStructure },
  code: redBlackStructure.code,
  prosCons: {
    pros: ['Guaranteed O(log n) search, insert and delete', 'Few rotations per change, so updates are cheap', 'Only one extra bit of memory per node'],
    cons: ['Slightly taller than an AVL tree, so lookups can be a little slower', 'The delete fix-up has many cases and is easy to get wrong', 'Harder to understand than a plain BST'],
    useWhen: ['Values are inserted and removed often and must stay sorted', 'You need guaranteed worst-case times', 'You are building an ordered map, set or scheduler queue'],
    avoidWhen: ['Lookups vastly outnumber changes (an AVL tree is a bit faster to search)', 'You only need exact-match lookups (use a hash table)'],
  },
  applications: [
    'Sorted maps and sets: Java TreeMap, C++ std::map and std::set',
    'The Linux kernel\'s scheduler and memory-area tracking',
    'Event queues and timers that need the earliest item and fast inserts',
  ],
  commonMistakes: [
    'Colouring new nodes black. That changes the black height of one path; new nodes must be red.',
    'Forgetting to make the root black at the end of an insert.',
    'Mixing up the near and far child of the sibling in the delete cases, especially in the mirrored cases.',
    'Losing track of the parent when the double black sits at an empty spot with no node to point at.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You insert 12 into this tree. It is attached as a red child of 15. Which fix comes next?',
      view: redBlackStructure.view(redBlackStructure.initial),
      options: ['Uncle 5 is red: recolour 5 and 15 black and 10 red', 'Rotate 15 right', 'Nothing: the rules still hold', 'Make 12 black'],
      answer: 0,
      explanation: '12\'s parent 15 is red, so two reds touch. The uncle, 5, is also red, so recolouring is enough: 5 and 15 turn black and 10 turns red. 10\'s parent 20 is black, so the fix ends there.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'How tall can a red-black tree with n values get?',
      options: ['At most about 2 × log₂ n', 'Up to n', 'Exactly log₂ n', 'At most about n / 2'],
      answer: 0,
      explanation: 'Every path has the same number of black nodes, and reds cannot be next to each other, so no path is more than twice as long as the shortest: O(log n).',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Why is a new node coloured red rather than black?',
      options: [
        'A red node does not change the number of black nodes on any path',
        'Searching is faster through red nodes than through black ones',
        'The root must be red, and a new node may become the root',
      ],
      answer: 0,
      explanation: 'Adding a black node would make one path longer in black nodes than all others, which is hard to fix. A red node can only break the red-red rule, which recolouring and rotations repair locally.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'A red leaf is deleted. How many fix-up steps run?',
      code: `remove(tree, 5); // 5 is a red leaf`,
      options: ['None', 'One recolouring', 'One rotation', 'One rotation per level'],
      answer: 0,
      explanation: 'Removing a red node leaves every path with the same number of black nodes and cannot put two reds together, so every rule still holds.',
    },
  ],
  summary: [
    'A red-black tree is a BST with red and black nodes and four colour rules.',
    'The rules keep the tree under 2 × log₂ n tall, so operations are O(log n) in the worst case.',
    'Insert fixes red-red clashes by recolouring or by one or two rotations.',
    'Delete fixes a "double black" by looking at the sibling, with four cases and their mirrors.',
  ],
};

export default content;
