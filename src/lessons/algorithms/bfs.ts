import { bfsCode, bfsSteps } from '../../algorithms/graph/bfs';
import { directedGraph, islandGraph, simpleGraph } from '../../algorithms/graph/graphs';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'Breadth-first search visits every node reachable from a starting node, in order of distance. It explores all nodes one edge away, then all nodes two edges away, and so on. Because of that order, the first time BFS reaches a node it has found the path with the fewest edges.',
  concept: [
    'Drop a stone in a pond and watch the ripple spread outward in rings. BFS explores a graph the same way: the start node, then its direct neighbours, then their neighbours.',
    'A queue makes this happen. Newly discovered nodes join the back of the queue, and the next node to explore comes from the front. Nodes discovered earlier (closer to the start) are therefore always explored before nodes discovered later.',
    'Graphs can contain cycles, so BFS marks each node the moment it is discovered. Without that, two nodes connected to each other would keep adding each other to the queue forever.',
  ],
  howItWorks: [
    'Mark the start node as visited and put it in the queue.',
    'Take the node at the front of the queue. This is the current node.',
    'Look at each neighbour of the current node.',
    'If a neighbour has not been visited, mark it visited and add it to the back of the queue.',
    'Repeat until the queue is empty.',
  ],
  visualization: { kind: 'graph', graphs: [simpleGraph, islandGraph, directedGraph], needsStart: true, generate: bfsSteps },
  code: bfsCode,
  prosCons: {
    pros: ['Finds the path with the fewest edges', 'Visits nodes in order of distance from the start', 'Simple, iterative, no recursion depth problems'],
    cons: ['The queue can grow large on wide graphs', 'Ignores edge weights, so it does not find the cheapest path in a weighted graph'],
    useWhen: ['You need the shortest path in an unweighted graph', 'You need nodes grouped by distance (levels)', 'The answer is likely to be close to the start'],
    avoidWhen: ['Edges have different weights (use Dijkstra)', 'The graph is very wide and memory is limited'],
  },
  applications: [
    'Fewest-moves puzzles and shortest routes on grids',
    '"People you may know": friends of friends at distance two',
    'Web crawlers exploring pages by link distance',
    'Finding all devices reachable on a network',
  ],
  commonMistakes: [
    'Marking a node visited when it leaves the queue instead of when it enters. The same node can then be queued many times.',
    'Using a stack by mistake, which turns the traversal into DFS.',
    'Forgetting the visited set entirely and looping forever on a cycle.',
    'Using BFS for shortest paths on a weighted graph.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'BFS started at A and has just discovered B and C. Which node is explored next?',
      view: bfsSteps(simpleGraph, 'A')[3]!.view,
      options: ['B, because it is at the front of the queue', 'C, because it was discovered last', 'D, because it is furthest away', 'A again'],
      answer: 0,
      explanation: 'The queue holds B then C. BFS always takes from the front, so B is explored before C.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which data structure gives BFS its level-by-level order?',
      options: ['A queue', 'A stack', 'A heap', 'A hash table'],
      answer: 0,
      explanation: 'First in, first out means nodes discovered earlier, which are closer to the start, are explored first.',
    },
    {
      id: 'q3',
      type: 'complexity',
      prompt: 'What is the time complexity of BFS on a graph with V nodes and E edges stored as an adjacency list?',
      options: ['O(V + E)', 'O(V²)', 'O(V × E)', 'O(E log V)'],
      answer: 0,
      explanation: 'Each node is dequeued once and each edge is examined a constant number of times.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'Edges: A—B, A—C, B—D, C—D, D—E. Neighbours are visited in alphabetical order. What does bfs(graph, "A") return?',
      code: `bfs(graph, 'A');`,
      options: ["['A', 'B', 'C', 'D', 'E']", "['A', 'B', 'D', 'C', 'E']", "['A', 'B', 'D', 'E', 'C']", "['A', 'C', 'B', 'D', 'E']"],
      answer: 0,
      explanation: 'Distance 0: A. Distance 1: B, C. Distance 2: D. Distance 3: E. BFS finishes each level before the next.',
    },
  ],
  summary: [
    'BFS explores a graph in rings of increasing distance from the start.',
    'It uses a queue and marks nodes as visited when they are discovered.',
    'It finds the path with the fewest edges in an unweighted graph.',
    'It runs in O(V + E) time and O(V) space.',
  ],
};

export default content;
