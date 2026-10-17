import type { Graph } from '../../types/lesson';

type NodeSpec = [id: string, x: number, y: number];
type EdgeSpec = [from: string, to: string, weight?: number];

export function makeGraph(id: string, name: string, directed: boolean, nodes: NodeSpec[], edges: EdgeSpec[]): Graph {
  return {
    id,
    name,
    directed,
    nodes: nodes.map(([nodeId, x, y]) => ({ id: nodeId, label: nodeId, x, y })),
    edges: edges.map(([from, to, weight]) => ({ from, to, ...(weight !== undefined && { weight }) })),
  };
}

export const simpleGraph = makeGraph(
  'simple',
  'Connected graph',
  false,
  [
    ['A', 50, 8],
    ['B', 25, 36],
    ['C', 75, 36],
    ['D', 8, 68],
    ['E', 42, 68],
    ['F', 92, 68],
    ['G', 66, 94],
  ],
  [
    ['A', 'B'],
    ['A', 'C'],
    ['B', 'D'],
    ['B', 'E'],
    ['C', 'E'],
    ['C', 'F'],
    ['E', 'G'],
    ['F', 'G'],
  ],
);

export const weightedGraph = makeGraph(
  'weighted',
  'Weighted graph',
  false,
  [
    ['A', 8, 50],
    ['B', 35, 14],
    ['C', 35, 86],
    ['D', 68, 14],
    ['E', 68, 86],
    ['F', 94, 50],
  ],
  [
    ['A', 'B', 4],
    ['A', 'C', 2],
    ['B', 'C', 1],
    ['B', 'D', 5],
    ['C', 'D', 8],
    ['C', 'E', 10],
    ['D', 'E', 2],
    ['D', 'F', 6],
    ['E', 'F', 3],
  ],
);

export const islandGraph = makeGraph(
  'islands',
  'Two separate islands',
  false,
  [
    ['A', 14, 22],
    ['B', 40, 56],
    ['C', 10, 84],
    ['D', 64, 16],
    ['E', 92, 46],
    ['F', 68, 86],
  ],
  [
    ['A', 'B', 3],
    ['B', 'C', 4],
    ['A', 'C', 9],
    ['D', 'E', 2],
    ['E', 'F', 5],
  ],
);

export const directedGraph = makeGraph(
  'directed',
  'Directed graph',
  true,
  [
    ['A', 8, 50],
    ['B', 38, 14],
    ['C', 38, 86],
    ['D', 68, 50],
    ['E', 94, 14],
  ],
  [
    ['A', 'B', 2],
    ['A', 'C', 6],
    ['B', 'D', 3],
    ['C', 'D', 1],
    ['D', 'E', 4],
    ['E', 'B', 1],
  ],
);

/** A prerequisite chart: an arrow means "must come before". */
export const courseGraph = makeGraph(
  'courses',
  'Course prerequisites',
  true,
  [
    ['A', 8, 50],
    ['B', 36, 14],
    ['C', 36, 86],
    ['D', 64, 40],
    ['E', 92, 14],
    ['F', 92, 86],
  ],
  [
    ['A', 'B'],
    ['A', 'C'],
    ['B', 'D'],
    ['C', 'D'],
    ['D', 'E'],
    ['C', 'F'],
  ],
);

export const buildGraph = makeGraph(
  'build',
  'Build steps with two starting points',
  true,
  [
    ['A', 8, 20],
    ['B', 8, 80],
    ['C', 36, 20],
    ['D', 36, 80],
    ['E', 64, 20],
    ['F', 64, 80],
    ['G', 92, 50],
  ],
  [
    ['A', 'C'],
    ['B', 'C'],
    ['B', 'D'],
    ['C', 'E'],
    ['D', 'E'],
    ['D', 'F'],
    ['E', 'G'],
    ['F', 'G'],
  ],
);

export const negativeGraph = makeGraph(
  'negative',
  'One negative edge',
  true,
  [
    ['A', 8, 50],
    ['B', 42, 14],
    ['C', 42, 86],
    ['D', 76, 14],
    ['E', 92, 72],
  ],
  [
    ['A', 'B', 4],
    ['A', 'C', 5],
    ['C', 'B', -3],
    ['B', 'D', 2],
    ['C', 'E', 6],
    ['D', 'E', 1],
  ],
);

/** B → C → D → B adds up to −1, so going round it again always gets cheaper. */
export const negativeCycleGraph = makeGraph(
  'negative-cycle',
  'Negative cycle',
  true,
  [
    ['A', 8, 50],
    ['B', 40, 18],
    ['C', 80, 18],
    ['D', 60, 84],
  ],
  [
    ['A', 'B', 1],
    ['B', 'C', 2],
    ['C', 'D', -4],
    ['D', 'B', 1],
  ],
);

/** Directed and weighted, for all-pairs shortest paths. No pair of nodes has edges both ways, so arrows never overlap. */
export const allPairsGraph = makeGraph(
  'all-pairs',
  'Directed weighted graph',
  true,
  [
    ['A', 10, 50],
    ['B', 50, 10],
    ['C', 90, 50],
    ['D', 50, 90],
  ],
  [
    ['A', 'B', 3],
    ['A', 'D', 7],
    ['B', 'C', 2],
    ['C', 'A', 5],
    ['C', 'D', 1],
    ['D', 'B', 4],
  ],
);

/** A negative edge but no negative cycle: B → C → D → B weighs 1. */
export const allPairsNegativeGraph = makeGraph(
  'all-pairs-negative',
  'With a negative edge',
  true,
  [
    ['A', 10, 50],
    ['B', 50, 12],
    ['C', 50, 88],
    ['D', 90, 50],
  ],
  [
    ['A', 'B', 4],
    ['A', 'C', 3],
    ['B', 'C', -2],
    ['C', 'D', 2],
    ['D', 'B', 1],
  ],
);

/** A triangle with a tail, plus a separate pair: two components and one cycle. */
export const cycleGraph = makeGraph(
  'cycle',
  'Graph with a cycle',
  false,
  [
    ['A', 12, 20],
    ['B', 44, 12],
    ['C', 30, 62],
    ['D', 56, 92],
    ['E', 76, 30],
    ['F', 94, 72],
  ],
  [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'A'],
    ['C', 'D'],
    ['E', 'F'],
  ],
);

/**
 * A 4 × 3 grid of nodes A–L. Edge weights are straight-line distances rounded up,
 * so the straight-line heuristic of A* never overestimates.
 */
function gridGraph(id: string, name: string, blocked: [string, string][]): Graph {
  const xs = [10, 37, 63, 90];
  const ys = [10, 50, 90];
  const nodes: NodeSpec[] = [];
  ys.forEach((y, r) => xs.forEach((x, c) => nodes.push([String.fromCharCode(65 + r * 4 + c), x, y])));
  const at = (r: number, c: number) => nodes[r * 4 + c]!;
  const edges: EdgeSpec[] = [];
  const link = (a: NodeSpec, b: NodeSpec) => {
    const isBlocked = blocked.some(([p, q]) => (p === a[0] && q === b[0]) || (p === b[0] && q === a[0]));
    if (!isBlocked) edges.push([a[0], b[0], Math.ceil(Math.hypot(b[1] - a[1], b[2] - a[2]))]);
  };
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (c < 3) link(at(r, c), at(r, c + 1));
      if (r < 2) link(at(r, c), at(r + 1, c));
    }
  }
  return makeGraph(id, name, false, nodes, edges);
}

export const wallGraph = gridGraph('wall', 'Grid with a wall', [
  ['B', 'C'],
  ['F', 'G'],
]);

export const openGraph = gridGraph('open', 'Open grid', []);

/** A flow network from source S to sink T; edge weights are capacities. Its maximum flow is 19. */
export const flowNetwork = makeGraph(
  'flow',
  'Flow network',
  true,
  [
    ['S', 6, 50],
    ['A', 36, 14],
    ['C', 36, 86],
    ['B', 68, 14],
    ['D', 68, 86],
    ['T', 94, 50],
  ],
  [
    ['S', 'A', 10],
    ['S', 'C', 10],
    ['A', 'B', 4],
    ['A', 'C', 2],
    ['A', 'D', 8],
    ['C', 'D', 9],
    ['D', 'B', 6],
    ['B', 'T', 10],
    ['D', 'T', 10],
  ],
);
