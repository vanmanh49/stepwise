import { islandGraph, weightedGraph } from '../../algorithms/graph/graphs';
import { kruskalCode, kruskalSteps } from '../../algorithms/graph/kruskal';
import { graphView } from '../../algorithms/graph/view';
import type { Lesson } from '../../types/lesson';

export const kruskal: Lesson = {
  id: 'kruskal',
  title: 'Kruskal',
  category: 'algorithms',
  difficulty: 'advanced',
  group: 'Minimum Spanning Tree',
  description: 'Connect every node as cheaply as possible by taking the cheapest safe edge each time.',
  keywords: ['minimum spanning tree', 'mst', 'greedy', 'union find', 'disjoint set', 'weighted graph', 'cycle'],
  prerequisites: ['graph'],
  overview:
    "Kruskal's algorithm finds a minimum spanning tree: the cheapest set of edges that keeps every node of a weighted graph connected. It sorts the edges by weight and takes them one by one, skipping any edge that would form a loop.",
  concept: [
    'Imagine laying cable between towns. Every possible link has a cost, and you want every town reachable from every other for the smallest total cost. You never need a loop: if three towns are already connected in a chain, a cable closing the triangle adds cost and no new reach. The result is a tree, and the cheapest one is the minimum spanning tree.',
    "Kruskal's approach is greedy: always consider the cheapest edge not yet looked at. Take it if it connects two parts that are still separate. Skip it if both ends are already connected to each other, because then it would close a loop.",
    'The only tricky question is "are these two nodes already connected?". Kruskal answers it by keeping the nodes in groups. At first every node is its own group. Taking an edge merges two groups. An edge whose ends are in the same group is the one to skip. The structure that tracks these groups efficiently is called a disjoint set, or union-find.',
    'It can feel surprising that grabbing the cheapest edge every time gives the best overall answer. It does: for spanning trees, the greedy choice is provably never wrong.',
  ],
  howItWorks: [
    'Put every node in a group of its own.',
    'Sort all edges from cheapest to most expensive.',
    'Take the next edge. If its two ends are in different groups, add it to the tree and merge the groups.',
    'If its two ends are in the same group, skip it: it would close a loop.',
    'Continue through the list. A connected graph with V nodes ends up with exactly V − 1 edges.',
  ],
  visualization: { kind: 'graph', graphs: [weightedGraph, islandGraph], needsStart: false, generate: kruskalSteps },
  code: kruskalCode,
  complexity: {
    rows: [{ label: 'Kruskal', best: 'O(E log E)', average: 'O(E log E)', worst: 'O(E log E)' }],
    space: 'O(V)',
    note: 'Sorting the E edges dominates the cost. With a proper disjoint set, each "same group?" check and each merge is practically constant time, so the loop over the edges adds almost nothing.',
    curves: ['nlogn'],
  },
  compareWith: ['prim', 'dijkstra'],
  prosCons: {
    pros: ['Simple idea: sort, then take or skip', 'Fast on sparse graphs with few edges', 'Works on disconnected graphs, producing a tree for each part'],
    cons: ['Needs all edges up front, sorted', 'Needs a disjoint-set structure to be efficient', 'Slower than Prim on dense graphs with very many edges'],
    useWhen: ['The graph is sparse', 'The edges are already sorted or easy to sort', 'The graph may not be connected'],
    avoidWhen: ['The graph is dense (Prim is usually better)', 'You need shortest paths rather than cheapest total connection (use Dijkstra)'],
  },
  applications: [
    'Designing road, cable, pipe or power networks with minimal material',
    'Clustering data: stop before the last few merges and the remaining groups are the clusters',
    'Approximating hard routing problems such as the travelling salesman',
    'Generating mazes by taking edges in random order',
  ],
  commonMistakes: [
    'Confusing a minimum spanning tree with shortest paths. The tree minimises total weight, not the distance between any two nodes.',
    'Detecting loops by searching the graph for every edge, instead of using groups, which is far slower.',
    'Forgetting to sort the edges first.',
    'Assuming the result is unique. Edges of equal weight can produce different trees with the same total.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Kruskal runs on this graph. Which edge does it take first?',
      view: graphView(weightedGraph),
      options: ['B–C, with weight 1', 'A–C, with weight 2', 'A–B, with weight 4', 'C–E, with weight 10'],
      answer: 0,
      explanation: 'Kruskal sorts all edges and starts with the cheapest one in the whole graph, wherever it is. That is B–C at weight 1.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'When does Kruskal skip an edge?',
      options: [
        'When both of its ends are already in the same group',
        'When it is heavier than the previous edge',
        'When one of its ends has too many edges already',
        'When it does not touch the start node',
      ],
      answer: 0,
      explanation: 'Two nodes in the same group are already connected by edges taken earlier. Another edge between them would close a loop.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: "What dominates the running time of Kruskal's algorithm on a graph with E edges?",
      options: ['Sorting the edges: O(E log E)', 'Visiting every node: O(V)', 'Checking every pair of nodes: O(V²)', 'Merging groups: O(E²)'],
      answer: 0,
      explanation: 'The group checks are nearly constant time each, so the sort is the expensive part.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'The graph has edges A–B (1), B–C (2) and A–C (3). What is the total weight of the tree this returns?',
      code: `const tree = kruskal(graph);\nconsole.log(tree.reduce((sum, e) => sum + e.weight, 0));`,
      options: ['3', '6', '4', '5'],
      answer: 0,
      explanation: 'A–B and B–C are taken (1 + 2 = 3). A–C is skipped because A and C are already connected through B.',
    },
  ],
  summary: [
    'A minimum spanning tree connects every node with the smallest total edge weight and no loops.',
    'Kruskal sorts the edges and takes each one unless its ends are already connected.',
    'Groups (a disjoint set) answer "already connected?" quickly.',
    'It runs in O(E log E) and also handles disconnected graphs.',
  ],
};
