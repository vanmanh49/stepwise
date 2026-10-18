import { bellmanFordCode, bellmanFordSteps } from '../../algorithms/graph/bellmanFord';
import { negativeCycleGraph, negativeGraph, weightedGraph } from '../../algorithms/graph/graphs';
import { graphView } from '../../algorithms/graph/view';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Bellman-Ford finds the shortest path from one node to every other node, like Dijkstra, but it also handles edges with negative weights. It does so by checking every edge again and again until nothing improves. It can also tell you when no answer exists because the graph contains a negative cycle.',
  concept: [
    'Dijkstra locks in the closest node and never looks at it again. That is only safe if paths can never get shorter by adding more edges, which is false once an edge can be negative. A cheaper route might show up later through a negative edge.',
    'Bellman-Ford makes no such assumption. Its only move is to relax an edge: if getting to A and then taking the edge A → B is cheaper than the best known way to B, update B. It simply relaxes every edge in the graph, then does it all again.',
    'Why does repetition work? After the first pass, every shortest path made of one edge is correct. After the second pass, every shortest path of up to two edges is correct, and so on. A shortest path never needs to visit a node twice, so it has at most V − 1 edges, and V − 1 passes are enough.',
    'A negative cycle is a loop whose weights add up to less than zero. Going round it again always lowers the cost, so "shortest" has no meaning. Bellman-Ford detects this with one extra pass: if any edge can still be relaxed after V − 1 passes, a negative cycle is the only explanation.',
  ],
  howItWorks: [
    'Set the distance of the start node to 0 and every other node to ∞.',
    'Go through every edge. If distance[from] + weight is less than distance[to], update distance[to].',
    'That was one pass. Repeat for V − 1 passes in total.',
    'If a whole pass changes nothing, stop early: the distances are final.',
    'Finally check every edge once more. If any could still be improved, the graph has a negative cycle.',
  ],
  visualization: {
    kind: 'graph',
    graphs: [negativeGraph, negativeCycleGraph, weightedGraph],
    needsStart: true,
    generate: bellmanFordSteps,
  },
  code: bellmanFordCode,
  prosCons: {
    pros: ['Handles negative edge weights', 'Detects negative cycles', 'Very simple: one loop inside another, no priority queue'],
    cons: ['Much slower than Dijkstra: O(V × E)', 'Wasteful when all weights are non-negative'],
    useWhen: ['Some edges have negative weights', 'You need to know whether a negative cycle exists', 'Each node only knows its own neighbours, as in distributed routing'],
    avoidWhen: ['All weights are non-negative (use Dijkstra)', 'All edges have the same weight (use BFS)'],
  },
  applications: [
    'Distance-vector routing protocols such as RIP, where routers share distance tables with neighbours',
    'Detecting arbitrage in currency exchange: a negative cycle is a loop of trades that makes money',
    'A first step inside more advanced algorithms, such as Johnson\'s algorithm for all pairs of nodes',
    'Scheduling problems with constraints that can be written as differences',
  ],
  commonMistakes: [
    'Running only one pass. One pass fixes paths of one edge; longer paths need more passes.',
    'Skipping the final check and returning distances for a graph that has a negative cycle.',
    'Adding a weight to ∞ in a language where that overflows. An unreachable node must stay unreachable.',
    'Using it out of habit when the weights are all non-negative and Dijkstra would be far faster.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Bellman-Ford runs from A on this graph. What is the final shortest distance to B?',
      view: graphView(negativeGraph),
      options: ['2', '4', '5', '1'],
      answer: 0,
      explanation: 'The direct edge A → B costs 4, but A → C → B costs 5 + (−3) = 2. The negative edge makes the longer-looking route cheaper.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why can Bellman-Ford handle negative edges when Dijkstra cannot?',
      options: [
        'It never treats a distance as final early; it keeps re-checking every edge',
        'It sorts the edges by weight first',
        'It ignores negative edges',
        'It converts negative weights to positive ones',
      ],
      answer: 0,
      explanation: 'Dijkstra finalises the closest node and moves on. Bellman-Ford lets any distance be lowered in any pass, so a late negative edge is still taken into account.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the worst-case time complexity of Bellman-Ford on a graph with V nodes and E edges?',
      options: ['O(V × E)', 'O(V + E)', 'O(E log V)', 'O(V²)'],
      answer: 0,
      explanation: 'It makes up to V − 1 passes, and each pass examines all E edges.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'After the V − 1 passes, this check finds an edge that can still be improved. What does that mean?',
      code: `for (const { from, to, weight } of graph.edges) {\n  if (dist[from] + weight < dist[to]) return { dist, negativeCycle: true };\n}`,
      options: [
        'The graph contains a negative cycle reachable from the start',
        'The algorithm needs one more pass to finish',
        'The start node is unreachable',
        'Two nodes have the same distance',
      ],
      answer: 0,
      explanation: 'V − 1 passes are enough for every real shortest path. Anything that can still improve must be going round a loop with a negative total.',
    },
  ],
  summary: [
    'Bellman-Ford relaxes every edge, V − 1 times, to find shortest paths from one node.',
    'It works with negative edge weights, where Dijkstra does not.',
    'One extra pass detects a negative cycle, in which case no shortest path exists.',
    'It costs O(V × E), so use it only when negative weights are possible.',
  ],
};

export default content;
