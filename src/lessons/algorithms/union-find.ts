import { cycleGraph, islandGraph } from '../../algorithms/graph/graphs';
import { unionFindCode, unionFindSteps } from '../../algorithms/graph/unionFind';
import type { Lesson } from '../../types/lesson';

export const unionFind: Lesson = {
  id: 'union-find',
  title: 'Union Find',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Advanced Algorithms',
  description: 'Count connected groups and spot cycles by merging groups edge by edge, with near-constant-time lookups.',
  keywords: ['disjoint set', 'dsu', 'connected components', 'cycle detection', 'path compression', 'union by rank'],
  prerequisites: ['graph', 'kruskal'],
  overview:
    'Union find answers one question very fast: are these two nodes already connected? It keeps every node in a group, represented by a tree whose root names the group. Going through a graph’s edges and merging the groups at both ends counts the connected components, and any edge whose ends are already in the same group closes a cycle.',
  concept: [
    'Imagine a party where people arrive alone and then introduce each other. Every introduction merges two circles of friends. To ask whether two guests are in the same circle, each circle has one representative, and everyone remembers who to ask on the way to them. Two guests are connected exactly when they lead to the same representative.',
    'In union find, each node stores a parent. Following parents leads to the root, the group’s representative. find(x) returns that root. union(a, b) finds both roots and, if they differ, hangs one root under the other, merging the groups.',
    'Two tricks keep the trees flat. Union by rank hangs the shorter tree under the taller one, so trees grow slowly. Path compression points every node visited during a find straight at the root, so later finds take one hop. Together they make each operation effectively constant time.',
    'Applied to a graph, that gives two answers in one pass over the edges: the number of distinct roots at the end is the number of connected components, and an edge whose ends already share a root closes a cycle. Kruskal’s algorithm uses exactly this to skip edges.',
  ],
  howItWorks: [
    'Make every node its own parent with rank 0.',
    'For each edge, find the roots of both ends, compressing the paths on the way.',
    'If the roots are the same, the edge closes a cycle.',
    'Otherwise hang the root with the smaller rank under the other; on a tie, pick one and increase its rank.',
    'At the end, count the distinct roots: that is the number of connected components.',
  ],
  visualization: { kind: 'graph', graphs: [cycleGraph, islandGraph], needsStart: false, generate: unionFindSteps },
  code: unionFindCode,
  complexity: {
    rows: [
      { label: 'Find or union', best: 'O(1)', average: 'O(α(n))', worst: 'O(log n)' },
      { label: 'Whole graph', best: 'O(V + E)', average: 'O(V + E α(V))', worst: 'O(V + E log V)' },
    ],
    space: 'O(V)',
    note: 'α is the inverse Ackermann function, which is at most 4 for any number of nodes that fits in the universe, so each operation is constant time in practice. A single operation can take O(log n) before the paths have been compressed.',
    curves: ['1', 'n'],
  },
  compareWith: ['kruskal'],
  prosCons: {
    pros: ['Near-constant time per find and union', 'Works as edges arrive, one at a time', 'Tiny implementation: two arrays and two short functions'],
    cons: ['Cannot split groups apart again', 'Does not give the actual path between two nodes', 'Only for undirected connectivity'],
    useWhen: ['Edges arrive over time and you need to know what is connected', 'Detecting cycles while building a tree, as in Kruskal', 'Counting groups of equivalent items'],
    avoidWhen: ['Edges are also removed', 'You need the path itself (use BFS or DFS)', 'The graph is directed and direction matters'],
  },
  applications: [
    'Kruskal’s minimum spanning tree: skip edges that close a cycle',
    'Counting islands or connected regions in a grid image',
    'Grouping accounts that share an email or phone number',
    'Checking network connectivity as links are added',
  ],
  commonMistakes: [
    'Comparing a and b directly instead of their roots.',
    'Hanging node b under node a instead of hanging root under root, which breaks the trees.',
    'Skipping path compression and union by rank, which can make trees as tall as a list.',
    'Counting components by counting nodes with parent equal to themselves before every node has been merged.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'A–B and B–C have been merged into one group. What happens with the next edge, C–A?',
      view: unionFindSteps(cycleGraph)[4]!.view,
      options: ['It is flagged as closing a cycle', 'A and C are merged', 'A new group is created', 'C becomes the root of everything'],
      answer: 0,
      explanation: 'C and A already lead to the same root, so they were connected before. The edge would close the loop A–B–C.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does path compression do?',
      options: [
        'Points every node visited during a find straight at the root',
        'Removes edges that close cycles',
        'Merges the two smallest groups',
        'Sorts the edges by weight',
      ],
      answer: 0,
      explanation: 'After one find walks a long path, every node on it links directly to the root, so later finds are one hop.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'With union by rank and path compression, what is the cost of one find in practice?',
      options: ['Effectively constant, O(α(n))', 'O(n)', 'O(n log n)', 'O(n²)'],
      answer: 0,
      explanation: 'α(n) grows so slowly that it never exceeds 4 for realistic n.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'After these unions, how many components are there?',
      code: '// nodes A, B, C, D, E\nunion(A, B);\nunion(C, D);\nunion(B, A);',
      options: ['3', '2', '4', '5'],
      answer: 0,
      explanation: '{A, B}, {C, D} and {E}. The second union of A and B changes nothing.',
    },
  ],
  summary: [
    'Union find keeps nodes in groups, each a tree whose root names the group.',
    'find follows parents to the root; union hangs one root under another.',
    'Union by rank and path compression make both effectively constant time.',
    'One pass over the edges counts connected components and finds cycle-closing edges.',
  ],
};
