import { disjointSetStructure } from '../../data-structures/disjointSet';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A disjoint set (also called union-find) splits items into groups that never overlap and answers one question fast: are these two items in the same group? It supports two operations: find, which names an item\'s group, and union, which merges two groups. With two simple tricks, both run in practically constant time.',
  concept: [
    'Each group is stored as a tree, but only upward links are kept: parent[i] says who i points to. The root of a tree points to itself, and it is the name of the group. All the trees together form a forest, stored in one plain array.',
    'Find follows parent pointers until it reaches a root. Union finds both roots and points one root at the other. Without care the trees can turn into long chains, so two tricks keep them flat.',
    'Union by rank attaches the shorter tree under the taller one, so heights grow only when two equally tall trees meet. Path compression makes every node passed during a find point straight at the root. Together they make a long sequence of operations cost about O(α(n)) each, where α grows so slowly it is below 5 for any real input.',
  ],
  howItWorks: [
    'Start with every item as its own root: parent[i] = i and rank[i] = 0.',
    'Find(x): follow parent pointers from x until a node is its own parent. That root names the set.',
    'Path compression: on the way back, point every node that was passed directly at the root.',
    'Union(a, b): find both roots. If they are the same, the items are already together.',
    'Otherwise attach the root with the smaller rank under the other. If the ranks are equal, pick one and raise its rank by 1.',
    'Connected?(a, b): two finds, then compare the roots.',
  ],
  visualization: { kind: 'structure', structure: disjointSetStructure },
  code: disjointSetStructure.code,
  prosCons: {
    pros: ['Near-constant time per operation', 'Just two arrays of integers', 'Very little code'],
    cons: ['Cannot split a group once merged', 'Cannot list a group\'s members without scanning everything', 'Items must be numbered 0 to n − 1 (or mapped to numbers)'],
    useWhen: ['Groups only ever merge', 'You ask "are these two connected?" many times', 'You build connected components edge by edge, as in Kruskal\'s algorithm'],
    avoidWhen: ['Groups need to split or items move between groups', 'You need to list the members of a group often'],
  },
  applications: [
    'Kruskal\'s minimum spanning tree algorithm, to skip edges that would form a cycle',
    'Finding connected components in networks or images',
    'Grouping accounts that share an email, or friends of friends',
    'Detecting cycles in an undirected graph',
  ],
  commonMistakes: [
    'Linking a to b directly instead of root to root. The trees break apart into the wrong groups.',
    'Comparing items instead of their roots when checking whether they are connected.',
    'Skipping both union by rank and path compression, which lets trees become O(n) chains.',
    'Updating ranks during path compression. Ranks are only an upper bound on height and stay as they are.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'You run find(3) on this forest. After path compression, what is parent[3]?',
      view: disjointSetStructure.view(disjointSetStructure.initial),
      options: ['0', '2', '3', '4'],
      answer: 0,
      explanation: 'find(3) climbs 3 → 2 → 0 and finds the root 0. Path compression then points 3 straight at 0.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'With union by rank and path compression, what is the average cost of each operation over a long sequence?',
      options: ['O(α(n)), practically constant', 'O(log n)', 'O(n)', 'O(n log n)'],
      answer: 0,
      explanation: 'The two tricks together give an amortised O(α(n)) per operation, where the inverse Ackermann function α(n) is below 5 for any realistic n.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Root A has rank 2 and root B has rank 1. What does union by rank do?',
      options: ['Points B at A; A\'s rank stays 2', 'Points A at B; B\'s rank becomes 3', 'Points B at A; A\'s rank becomes 3'],
      answer: 0,
      explanation: 'The shorter tree goes under the taller one, so the height does not grow and the rank stays the same. Ranks only rise when equal ranks meet.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Starting with 4 separate elements, how many sets are left after these calls?',
      code: `union(0, 1);\nunion(2, 3);\nunion(1, 0);`,
      options: ['2', '1', '3', '4'],
      answer: 0,
      explanation: 'The first two unions make {0, 1} and {2, 3}. The third finds that 1 and 0 already share a root, so nothing changes: 2 sets.',
    },
  ],
  summary: [
    'A disjoint set stores groups as trees of parent pointers in one array; each root names its group.',
    'Find climbs to the root; union points one root at another.',
    'Union by rank keeps trees short; path compression flattens them as they are used.',
    'Together they make each operation practically constant time, which is why Kruskal\'s algorithm relies on it.',
  ],
};

export default content;
