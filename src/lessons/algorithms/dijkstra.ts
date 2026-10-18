import { dijkstraCode, dijkstraSteps } from '../../algorithms/graph/dijkstra';
import { directedGraph, islandGraph, weightedGraph } from '../../algorithms/graph/graphs';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    "Dijkstra's algorithm finds the shortest path from a start node to every other node when edges have different costs. It repeatedly picks the closest node that is not finished yet, locks in its distance, and checks whether going through it gives a shorter route to its neighbours.",
  concept: [
    'BFS finds the route with the fewest edges. When edges have weights (minutes, kilometres, cost), the route with the fewest edges is often not the cheapest. Dijkstra handles weights.',
    'It keeps a best-known distance for every node, starting at 0 for the start and ∞ for everything else. These are estimates that can only go down.',
    'The central insight: among all unfinished nodes, the one with the smallest estimate cannot be improved. Any other route to it would have to pass through a node that is already further away, and weights are never negative, so it could only be longer. That node’s distance is final.',
    'After finalising a node, the algorithm "relaxes" its edges: for each neighbour, if distance-to-here plus edge weight beats the neighbour’s current estimate, the estimate is lowered.',
  ],
  howItWorks: [
    'Set the distance of the start node to 0 and every other node to ∞.',
    'Pick the unvisited node with the smallest known distance. Its distance is now final.',
    'For each unvisited neighbour, compute candidate = distance to the current node + edge weight.',
    'If the candidate is smaller than the neighbour’s current distance, update it and remember the current node as its parent.',
    'Mark the current node as visited and repeat until every reachable node is visited.',
    'To read a path, follow the parent links backwards from the destination to the start.',
  ],
  visualization: { kind: 'graph', graphs: [weightedGraph, directedGraph, islandGraph], needsStart: true, generate: dijkstraSteps },
  code: dijkstraCode,
  prosCons: {
    pros: ['Finds true shortest paths in weighted graphs', 'Computes distances to all nodes in one run', 'Efficient with a priority queue'],
    cons: ['Gives wrong answers if any edge weight is negative', 'Explores in all directions, even away from the target', 'More complex than BFS'],
    useWhen: ['Edges have non-negative weights and you need the cheapest route', 'You need distances from one source to many destinations'],
    avoidWhen: ['Any weight is negative (use Bellman-Ford)', 'All edges have the same weight (BFS is simpler and faster)', 'You have a good estimate of the remaining distance to a single target (A* is faster)'],
  },
  applications: [
    'Route planning in maps and navigation',
    'Network routing protocols such as OSPF',
    'Finding the cheapest sequence of flights or currency exchanges with non-negative costs',
    'Pathfinding for characters in games',
  ],
  commonMistakes: [
    'Using it with negative edge weights. A finalised distance could later turn out to be wrong.',
    'Finalising a node when it is first discovered instead of when it is the closest unvisited node.',
    'Forgetting to store parents, and ending up with distances but no way to reconstruct the route.',
    'Using BFS on a weighted graph and expecting the cheapest path.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Dijkstra started at A and has just finished checking A’s edges. Badges show current distances. Which node is picked next?',
      view: dijkstraSteps(weightedGraph, 'A')[3]!.view,
      options: [
        'C, because it has the smallest known distance (2)',
        'B, because it comes first alphabetically',
        'F, because it is the destination',
        'D, because it has the most edges',
      ],
      answer: 0,
      explanation: 'The algorithm always finalises the unvisited node with the smallest distance. C at 2 beats B at 4.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: "Why does Dijkstra's algorithm fail with negative edge weights?",
      options: [
        'A node finalised as "closest" could later be reached more cheaply through a negative edge',
        'Negative numbers cannot be stored in a priority queue',
        'The graph becomes disconnected',
        'It only fails on directed graphs',
      ],
      answer: 0,
      explanation: 'The proof that the closest unvisited node is final relies on paths never getting shorter as edges are added. Negative edges break that.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: "What is the time complexity of Dijkstra's algorithm with a binary heap?",
      options: ['O((V + E) log V)', 'O(V + E)', 'O(V³)', 'O(E²)'],
      answer: 0,
      explanation: 'Each node is extracted from the heap once and each edge may cause one heap update; each heap operation costs O(log V).',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Edges: A—B 4, A—C 1, C—B 2, B—D 5. What is dist.D after dijkstra(graph, "A")?',
      code: `const dist = dijkstra(graph, 'A');\nconsole.log(dist.D);`,
      options: ['8', '9', '6', '5'],
      answer: 0,
      explanation: 'The direct edge A—B costs 4, but A → C → B costs 1 + 2 = 3. Then B → D adds 5, giving 8.',
    },
  ],
  summary: [
    'Dijkstra finds shortest paths from one node to all others in a graph with non-negative weights.',
    'It repeatedly finalises the closest unvisited node, then relaxes its edges.',
    'With a priority queue it runs in O((V + E) log V).',
    'It does not work with negative edge weights.',
  ],
};

export default content;
