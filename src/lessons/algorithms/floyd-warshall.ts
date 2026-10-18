import { floydWarshallCode, floydWarshallSteps } from '../../algorithms/graph/floydWarshall';
import { allPairsGraph, allPairsNegativeGraph } from '../../algorithms/graph/graphs';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Floyd-Warshall computes the shortest distance between every pair of nodes in a weighted graph. It keeps a table of best-known distances and improves it in rounds: in round k, any path may also pass through node k. After every node has had its round, the table holds all shortest distances. It handles negative edges, as long as there is no negative cycle.',
  concept: [
    'Picture a table of travel times between every pair of cities, filled in only for direct flights. Now allow one stopover city, say Paris: for each pair, would going via Paris be faster? Update the table. Then also allow Rome, and so on. Once every city is allowed as a stopover, every entry is the true shortest time.',
    'The order matters in a clever way. When node k gets its turn, the distances i → k and k → j already use the best routes through all earlier nodes. So checking "i → k → j" in one step accounts for routes through any combination of the first k nodes.',
    'That is dynamic programming: each round builds on the answers of the previous round. It needs no priority queue and no start node, just three nested loops over the nodes.',
  ],
  howItWorks: [
    'Fill a table: 0 from each node to itself, the edge weight for direct edges, ∞ for everything else.',
    'Pick the next node k as the allowed stopover.',
    'For every pair i, j, if dist[i][k] + dist[k][j] is smaller than dist[i][j], replace it.',
    'Repeat until every node has been the stopover.',
    'If some dist[v][v] ends up negative, the graph has a negative cycle and those distances are meaningless.',
  ],
  visualization: { kind: 'graph', graphs: [allPairsGraph, allPairsNegativeGraph], needsStart: false, generate: floydWarshallSteps },
  code: floydWarshallCode,
  prosCons: {
    pros: ['Answers every pair in one run', 'Handles negative edge weights', 'Detects negative cycles', 'Tiny, loop-only code'],
    cons: ['O(V³) time, too slow for large graphs', 'O(V²) memory for the table', 'Wasteful if you only need distances from one node'],
    useWhen: ['The graph is small or dense (up to a few hundred nodes)', 'You need distances between many pairs', 'Edges can be negative'],
    avoidWhen: ['You need distances from a single start (use Dijkstra or Bellman-Ford)', 'The graph has thousands of nodes'],
  },
  applications: [
    'Precomputing travel times between every pair of stops in a small transit network',
    'Finding which nodes can reach which (transitive closure)',
    'Network routing tables for small networks',
    'Finding the most central node: the one with the smallest maximum distance to the others',
  ],
  commonMistakes: [
    'Putting the k loop inside the i and j loops instead of outside them, which gives wrong answers.',
    'Adding ∞ + ∞ or ∞ + a negative number with fixed-size integers, which can overflow into a small number.',
    'Forgetting to set each node’s distance to itself to 0.',
    'Ignoring negative cycles: when dist[v][v] < 0, the affected distances are not real shortest paths.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The table holds only direct edges. Which node is allowed as the first stopover?',
      view: floydWarshallSteps(allPairsGraph)[0]!.view,
      options: ['A, the first node', 'D, the last node', 'The node with the most edges', 'All nodes at once'],
      answer: 0,
      explanation: 'The outer loop goes through the nodes in order, so A is allowed as a stopover first.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the time complexity of Floyd-Warshall on V nodes?',
      options: ['O(V³)', 'O(V²)', 'O(E log V)', 'O(V × E)'],
      answer: 0,
      explanation: 'It runs three nested loops over all V nodes, whatever the edges are.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'Which loop must be the outermost?',
      options: ['The loop over the stopover node k', 'The loop over i', 'The loop over j', 'Any order works'],
      answer: 0,
      explanation: 'Each round for k relies on distances that already use all earlier stopovers. With k inside, that is not true and some paths are missed.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'dist[A][C] is 9, dist[A][B] is 3 and dist[B][C] is 2. What is dist[A][C] after the round for k = B?',
      code: 'if (dist[A][B] + dist[B][C] < dist[A][C])\n  dist[A][C] = dist[A][B] + dist[B][C];',
      options: ['5', '9', '3', '2'],
      answer: 0,
      explanation: 'Going through B costs 3 + 2 = 5, which beats 9.',
    },
  ],
  summary: [
    'Floyd-Warshall finds shortest distances between all pairs of nodes.',
    'In round k, every path may also pass through node k.',
    'It is O(V³) time and O(V²) memory, and fine for small or dense graphs.',
    'It handles negative edges and reveals negative cycles through negative dist[v][v].',
  ],
};

export default content;
