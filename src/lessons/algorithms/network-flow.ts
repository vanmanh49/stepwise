import { flowNetwork } from '../../algorithms/graph/graphs';
import { networkFlowCode, networkFlowSteps } from '../../algorithms/graph/networkFlow';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A flow network is a directed graph whose edges have capacities, like pipes that can carry only so much water. The maximum flow problem asks how much can travel from a source S to a sink T at once. Edmonds-Karp answers it by repeatedly finding a path with spare room, using breadth-first search, and pushing as much as that path allows.',
  concept: [
    'Think of a road network at rush hour. Each road can carry a certain number of cars per minute. How many cars per minute can get from the suburb S to the city centre T? Every junction passes on exactly as many cars as arrive, and no road may carry more than its capacity.',
    'The natural idea is to find any route with room left and send more along it, as much as its tightest road allows. That route is an augmenting path, and its tightest spare capacity is the bottleneck. Repeat until no route has room.',
    'A naive version can get stuck with a poor choice made early. The fix is to allow a path to run backwards along an edge that already carries flow, which cancels some of that flow and sends it another way. That is how earlier decisions are undone. The graph of spare capacities, including these backward options, is called the residual graph.',
    'When no augmenting path is left, the flow is maximum. The nodes still reachable from S then form one side of a cut whose leaving edges are all full, and the max-flow min-cut theorem says that this cut’s capacity equals the maximum flow.',
  ],
  howItWorks: [
    'Start with zero flow on every edge.',
    'Use breadth-first search to find a path from S to T with the fewest edges, using edges with spare capacity forwards or edges with flow backwards.',
    'If there is no such path, stop: the flow is maximum.',
    'The bottleneck is the smallest spare capacity on the path. Add it to forward edges and subtract it from backward ones.',
    'Add the bottleneck to the total and search again.',
  ],
  visualization: { kind: 'graph', graphs: [flowNetwork], needsStart: false, generate: networkFlowSteps },
  code: networkFlowCode,
  prosCons: {
    pros: ['Always finds the maximum flow', 'Running time does not depend on the capacity values', 'Also yields a minimum cut'],
    cons: ['Slower than modern algorithms such as Dinic’s on large graphs', 'Needs integer or rational capacities to be sure it stops', 'The residual graph idea takes time to grasp'],
    useWhen: ['Networks of moderate size', 'Matching problems such as assigning workers to jobs', 'You need the minimum cut too'],
    avoidWhen: ['Very large networks where Dinic’s or push-relabel algorithms are much faster'],
  },
  applications: [
    'Maximum throughput of roads, pipes or data networks',
    'Bipartite matching, such as assigning students to projects',
    'Image segmentation via minimum cuts',
    'Scheduling and transport problems with capacity limits',
  ],
  commonMistakes: [
    'Forgetting backward edges, so an early bad path can never be undone and the result is too small.',
    'Pushing a path’s first capacity instead of its bottleneck.',
    'Letting flow into a node differ from flow out of it.',
    'Using depth-first search for paths, which can need many more rounds than BFS.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This augmenting path has spare capacities 10, 4 and 10. How much flow is pushed along it?',
      view: networkFlowSteps(flowNetwork)[1]!.view,
      options: ['4, the bottleneck', '10', '24, the sum', '0'],
      answer: 0,
      explanation: 'A path can only carry as much as its tightest edge allows.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why may an augmenting path run backwards along an edge?',
      options: ['To cancel flow sent earlier and reroute it', 'Because the graph is undirected', 'To find a longer path', 'To lower the capacity'],
      answer: 0,
      explanation: 'Backward hops undo earlier choices, which is what lets the algorithm reach the true maximum.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'When no augmenting path is left, what is true?',
      options: [
        'The flow equals the capacity of a minimum cut',
        'Every edge is full',
        'The flow is zero',
        'There is a cycle in the graph',
      ],
      answer: 0,
      explanation: 'The nodes reachable from S form one side of a cut whose leaving edges are all full: the max-flow min-cut theorem.',
    },
    {
      id: 'q4',
      type: 'complexity',
      prompt: 'What is the running time of Edmonds-Karp?',
      options: ['O(V × E²)', 'O(V + E)', 'O(E log V)', 'O(2ⁿ)'],
      answer: 0,
      explanation: 'At most O(V × E) augmenting paths, each found with a BFS in O(E).',
    },
  ],
  summary: [
    'Maximum flow asks how much can move from S to T without exceeding any edge capacity.',
    'Edmonds-Karp pushes the bottleneck along the shortest path with spare room, found by BFS.',
    'Backward hops cancel earlier flow, so mistakes can be undone.',
    'At the end, the maximum flow equals the capacity of a minimum cut.',
  ],
};

export default content;
