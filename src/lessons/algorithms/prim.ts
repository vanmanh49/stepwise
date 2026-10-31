import { islandGraph, weightedGraph } from '../../algorithms/graph/graphs';
import { primCode, primSteps } from '../../algorithms/graph/prim';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    "Prim's algorithm builds a minimum spanning tree by starting from a single node and growing outward. At each step it looks at every edge that leads from the tree to a node outside it, and adds the cheapest one. It reaches the same total weight as Kruskal by a different route.",
  concept: [
    'Kruskal picks edges from anywhere in the graph and lets separate pieces merge. Prim keeps a single tree at all times and extends it one node at a time, like a stain spreading from a starting point.',
    'At any moment the nodes are split into two sides: those in the tree and those not yet in it. The tree must eventually reach the other side, and it can only do so through an edge that crosses between the two. Among all crossing edges, taking the cheapest is always safe.',
    'An edge with both ends inside the tree is never useful: its ends are already connected, so it would close a loop. Prim never has to check for loops explicitly, because it only ever considers crossing edges.',
    'The code here finds the cheapest crossing edge by scanning all edges, which is easy to follow. Real implementations keep the crossing edges in a priority queue so the cheapest is always at hand.',
  ],
  howItWorks: [
    'Put the start node in the tree.',
    'Find every edge with one end in the tree and the other end outside it.',
    'Add the cheapest of those edges, and the new node it reaches, to the tree.',
    'Repeat until no edge leaves the tree.',
    'If every node was reached, the tree spans the graph. If not, the graph is not connected.',
  ],
  visualization: { kind: 'graph', graphs: [weightedGraph, islandGraph], needsStart: true, generate: primSteps },
  code: primCode,
  prosCons: {
    pros: ['Never needs a loop check or a disjoint set', 'Efficient on dense graphs', 'Can start producing the tree before all edges are known, as long as neighbours can be listed'],
    cons: ['Only spans the part of the graph connected to the start node', 'Needs a priority queue to be efficient', 'Slightly more bookkeeping than Kruskal on sparse graphs'],
    useWhen: ['The graph is dense', 'You already have an adjacency list and a priority queue', 'You want the tree to grow from a particular node'],
    avoidWhen: ['The graph may be disconnected and you need every part covered (Kruskal handles that directly)'],
  },
  applications: [
    'Network design: laying cable or pipe to connect sites at minimum cost',
    'Generating mazes: grow passages outward from a starting cell',
    'Image segmentation, where pixels are nodes and similarity gives the edge weights',
    'Approximating routes for delivery and circuit-board wiring',
  ],
  commonMistakes: [
    "Mixing it up with Dijkstra. Prim compares the weight of a single edge; Dijkstra compares the total distance from the start. The code looks similar but the results differ.",
    'Considering edges between two nodes that are both already in the tree, which creates loops.',
    'Assuming the tree depends on the start node. The total weight is the same from any start, though the edges may differ when weights tie.',
    'Not noticing that some nodes were never reached on a disconnected graph.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Prim has just started at A, so the tree contains only A. Which edge is added first?',
      view: primSteps(weightedGraph, 'A')[0]!.view,
      options: ['A–C, with weight 2', 'B–C, with weight 1', 'A–B, with weight 4', 'D–E, with weight 2'],
      answer: 0,
      explanation: 'Only edges touching the tree count. From A those are A–B (4) and A–C (2), so A–C is added. B–C is cheaper but does not touch the tree yet.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: "How does Prim's algorithm differ from Kruskal's?",
      options: [
        'Prim grows one tree from a start node; Kruskal takes the cheapest edges anywhere and merges pieces',
        'Prim finds a heavier tree',
        'Prim only works on directed graphs, while Kruskal works on undirected ones',
        'Prim sorts every edge first, and Kruskal grows one tree from a start node',
      ],
      answer: 0,
      explanation: 'Both are greedy and both reach the minimum total weight. They differ in which edges are candidates at each step.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: "What is the time complexity of Prim's algorithm with a binary heap?",
      options: ['O(E log V)', 'O(V + E)', 'O(V³)', 'O(E²)'],
      answer: 0,
      explanation: 'Each edge enters and leaves the priority queue at most once, and each queue operation costs O(log V).',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'In the code, which edges are allowed to become "best"?',
      code: `const crosses = inTree.has(edge.from) !== inTree.has(edge.to);\nif (crosses && (!best || edge.weight < best.weight)) best = edge;`,
      options: [
        'Edges with exactly one end inside the tree',
        'Edges with both ends inside the tree',
        'Edges with both ends outside the tree',
        'Any edge lighter than the last one added',
      ],
      answer: 0,
      explanation: 'The !== is true only when one end is in the tree and the other is not. Such an edge extends the tree to a new node without closing a loop.',
    },
  ],
  summary: [
    'Prim grows a single tree from a start node.',
    'Each step adds the cheapest edge that crosses from the tree to a node outside it.',
    'It reaches the same minimum total weight as Kruskal.',
    'With a priority queue it runs in O(E log V).',
  ],
};

export default content;
