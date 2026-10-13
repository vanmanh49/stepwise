import type { Graph } from '../../types/lesson';

type NodeSpec = [id: string, x: number, y: number];
type EdgeSpec = [from: string, to: string, weight?: number];

function makeGraph(id: string, name: string, directed: boolean, nodes: NodeSpec[], edges: EdgeSpec[]): Graph {
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
