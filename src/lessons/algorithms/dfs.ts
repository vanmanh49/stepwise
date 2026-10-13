import { dfsCode, dfsSteps } from '../../algorithms/graph/dfs';
import { directedGraph, islandGraph, simpleGraph } from '../../algorithms/graph/graphs';
import type { Lesson } from '../../types/lesson';

export const dfs: Lesson = {
  id: 'dfs',
  title: 'Depth-First Search (DFS)',
  category: 'algorithms',
  difficulty: 'intermediate',
  group: 'Graph Algorithms',
  description: 'Follow one path as deep as it goes, then back up and try the next.',
  keywords: ['dfs', 'depth first', 'traversal', 'stack', 'recursion', 'backtracking', 'cycle detection'],
  prerequisites: ['graph', 'stack', 'bfs'],
  overview:
    'Depth-first search explores a graph by going as far as possible along one path before backing up. From each node it moves to an unvisited neighbour, and only when a node has no unvisited neighbours left does it return to the previous node and try another direction.',
  concept: [
    'Think of exploring a maze with one hand on the wall. You keep walking forward until you hit a dead end, then walk back to the last junction and take a turn you have not tried yet.',
    'DFS needs to remember the way back. A stack does that: each node you enter goes on top, and backing up means popping it off. The recursive version shown here uses the call stack for the same job.',
    'Like BFS, DFS marks nodes as visited so it never walks in circles. Unlike BFS, the path it finds to a node is not necessarily the shortest one.',
  ],
  howItWorks: [
    'Mark the current node as visited.',
    'Look at its neighbours one at a time.',
    'If a neighbour is unvisited, move to it immediately and repeat these steps from there.',
    'If a neighbour is already visited, skip it.',
    'When every neighbour has been handled, return (backtrack) to the node you came from.',
  ],
  visualization: { kind: 'graph', graphs: [simpleGraph, islandGraph, directedGraph], needsStart: true, generate: dfsSteps },
  code: dfsCode,
  complexity: {
    rows: [{ label: 'DFS', best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' }],
    space: 'O(V)',
    note: 'Like BFS, each node is visited once and each edge examined once. The memory goes to the visited set and the stack, which can be as deep as the longest path: up to V nodes.',
    curves: ['n'],
  },
  compareWith: ['bfs', 'dijkstra'],
  prosCons: {
    pros: ['Uses little memory on wide graphs: only the current path is stored', 'Natural fit for recursion and backtracking', 'Reveals structure such as cycles and dependency order'],
    cons: ['Does not find shortest paths', 'Deep graphs can overflow the call stack in the recursive form', 'May wander far from the start before checking nearby nodes'],
    useWhen: ['You need to explore every possibility (puzzles, mazes, permutations)', 'You need to detect cycles or order dependencies', 'Any path will do, not the shortest'],
    avoidWhen: ['You need the shortest path (use BFS or Dijkstra)', 'The graph is extremely deep and you are recursing'],
  },
  applications: [
    'Solving mazes and puzzles such as Sudoku by backtracking',
    'Topological sort: ordering tasks by their dependencies',
    'Detecting cycles, for example circular imports',
    'Finding connected groups, such as regions of the same colour in an image',
  ],
  commonMistakes: [
    'Forgetting to mark a node visited before recursing, causing infinite recursion on a cycle.',
    'Expecting DFS to return the shortest path.',
    'Recursing on very deep graphs and overflowing the call stack. An explicit stack avoids this.',
    'Assuming one DFS reaches every node. Disconnected parts need their own starting points.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'DFS started at A and has just moved to B. What does it do next?',
      view: dfsSteps(simpleGraph, 'A')[3]!.view,
      options: [
        'It explores an unvisited neighbour of B, going deeper',
        'It returns to A and visits C',
        'It visits every neighbour of A first',
        'It stops',
      ],
      answer: 0,
      explanation: 'DFS always goes deeper while it can. The other neighbours of A wait until everything reachable through B is done.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which data structure does DFS rely on?',
      options: ['A stack (often the call stack)', 'A queue', 'A heap', 'A sorted array'],
      answer: 0,
      explanation: 'Last in, first out means the most recently entered node is the one continued from, which is what "go deeper" means.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Edges: A—B, A—C, B—D, C—D, D—E. Neighbours are visited in alphabetical order. What does dfs(graph, "A") return?',
      code: `dfs(graph, 'A');`,
      options: ["['A', 'B', 'D', 'C', 'E']", "['A', 'B', 'C', 'D', 'E']", "['A', 'C', 'D', 'B', 'E']", "['A', 'B', 'D', 'E', 'C']"],
      answer: 0,
      explanation: 'A → B → D. From D the neighbours are B (visited), then C, so C comes next. C has nothing new, so back at D, then E.',
    },
    {
      id: 'q4',
      type: 'complexity',
      prompt: 'How much extra memory can recursive DFS need on a graph with V nodes?',
      options: ['O(V)', 'O(1)', 'O(log V)', 'O(V²)'],
      answer: 0,
      explanation: 'In the worst case the graph is one long chain, and the recursion goes V calls deep.',
    },
  ],
  summary: [
    'DFS goes as deep as possible along one path, then backtracks.',
    'It uses a stack, either explicit or the call stack through recursion.',
    'It runs in O(V + E) but does not find shortest paths.',
    'It is the basis for backtracking, cycle detection and topological sorting.',
  ],
};
