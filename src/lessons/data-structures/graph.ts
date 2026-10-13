import { directedGraph, simpleGraph, weightedGraph } from '../../algorithms/graph/graphs';
import { graphView } from '../../algorithms/graph/view';
import { adjacencyCode, adjacencySteps } from '../../data-structures/graph';
import type { Lesson } from '../../types/lesson';

export const graph: Lesson = {
  id: 'graph',
  title: 'Graph',
  category: 'data-structures',
  difficulty: 'intermediate',
  description: 'Nodes joined by edges: the structure for anything that is connected.',
  keywords: ['vertex', 'edge', 'node', 'adjacency list', 'adjacency matrix', 'directed', 'weighted', 'network'],
  prerequisites: ['array', 'linked-list'],
  overview:
    'A graph is a set of nodes (also called vertices) and the edges that connect them. Unlike a tree, a graph has no root and no rule about shape: any node can connect to any other, and loops are allowed. Road maps, social networks and the web are all graphs.',
  concept: [
    'Edges come in a few flavours. An undirected edge works both ways, like a friendship. A directed edge works one way, like following someone. A weighted edge carries a number, such as a distance or a cost.',
    'The most common way to store a graph is an adjacency list: for each node, keep a list of the nodes it connects to. Asking "who are the neighbours of A?" is then a single lookup, which is what almost every graph algorithm needs.',
    'The alternative is an adjacency matrix: a V × V grid where cell (A, B) says whether an edge exists. It answers "is A connected to B?" instantly but uses V² memory even if there are few edges.',
  ],
  howItWorks: [
    'Add a node: create an empty neighbour list for it.',
    'Add an undirected edge A — B: add B to the list of A and A to the list of B.',
    'Add a directed edge A → B: add B to the list of A only.',
    'For a weighted graph, store the weight alongside each neighbour.',
    'Get neighbours: read the list for that node. Traversals such as BFS and DFS are built from this one operation.',
  ],
  visualization: {
    kind: 'graph',
    graphs: [simpleGraph, directedGraph, weightedGraph],
    needsStart: true,
    generate: adjacencySteps,
  },
  code: adjacencyCode,
  complexity: {
    rows: [
      { label: 'Add node', best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
      { label: 'Add edge', best: 'O(1)', average: 'O(1)', worst: 'O(1)' },
      { label: 'List neighbours of a node', best: 'O(1)', average: 'O(degree)', worst: 'O(V)' },
      { label: 'Check whether an edge exists', best: 'O(1)', average: 'O(degree)', worst: 'O(V)' },
    ],
    space: 'O(V + E)',
    note: 'V is the number of nodes and E the number of edges. "Degree" is how many edges touch one node. An adjacency list only stores edges that exist; an adjacency matrix always uses O(V²) space but checks an edge in O(1).',
    curves: ['1', 'n'],
  },
  prosCons: {
    pros: ['Models any kind of relationship', 'Adjacency lists are compact for sparse graphs', 'A huge library of ready-made algorithms applies'],
    cons: ['More complex than linear structures', 'Cycles mean algorithms must track visited nodes', 'Adjacency lists make "is A connected to B?" slower than a matrix'],
    useWhen: ['Items have many-to-many relationships', 'You need paths, reachability or connectivity', 'The data is a network, map, dependency chart or state machine'],
    avoidWhen: ['The data is a simple sequence or strict hierarchy (an array or tree is simpler)'],
  },
  applications: [
    'Maps and navigation: junctions are nodes, roads are weighted edges',
    'Social networks: people are nodes, friendships are edges',
    'Package managers and build tools: dependencies form a directed graph',
    'The web: pages are nodes, links are directed edges',
  ],
  commonMistakes: [
    'Adding only one direction of an undirected edge.',
    'Forgetting that graphs can contain cycles, and looping forever during traversal.',
    'Assuming the graph is connected. Some nodes may be unreachable from others.',
    'Choosing an adjacency matrix for a large sparse graph and running out of memory.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'In this undirected graph, what is the adjacency list entry for node E?',
      view: graphView(simpleGraph),
      options: ['B, C, G', 'A, B', 'B, C', 'C, F, G'],
      answer: 0,
      explanation: 'Three edges touch E: B — E, C — E and E — G. An undirected edge appears in the lists of both of its ends.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'How much memory does an adjacency list need for a graph with V nodes and E edges?',
      options: ['O(V + E)', 'O(V²)', 'O(E²)', 'O(V × E)'],
      answer: 0,
      explanation: 'There is one list per node and one entry per edge (two for undirected edges), so memory grows with V + E.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'The graph is directed, so addEdge only stores the forward direction. What does this print?',
      code: `graph.addEdge('A', 'B');\ngraph.addEdge('B', 'C');\nconsole.log(graph.neighbours('B'));`,
      options: ["['C']", "['A', 'C']", "['A']", '[]'],
      answer: 0,
      explanation: 'A → B puts B in the list of A, not the reverse. Only B → C adds something to the list of B.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How does a graph differ from a tree?',
      options: [
        'A graph may contain cycles and has no single root',
        'A graph cannot have more than two edges per node',
        'A tree can be disconnected but a graph cannot',
        'A graph must have weighted edges',
      ],
      answer: 0,
      explanation: 'A tree is a special graph: connected, with no cycles. General graphs drop both restrictions.',
    },
  ],
  summary: [
    'A graph is nodes plus edges; edges can be directed or undirected, weighted or unweighted.',
    'An adjacency list stores, for each node, the list of its neighbours, using O(V + E) memory.',
    'Graphs can contain cycles and disconnected parts, so algorithms must track what they have visited.',
    'BFS, DFS and Dijkstra all work by repeatedly asking for the neighbours of a node.',
  ],
};
