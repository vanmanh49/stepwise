export interface Graph {
  id: string;
  name: string;
  directed: boolean;
  /** x and y are positions in a 0–100 box. */
  nodes: { id: string; label: string; x: number; y: number }[];
  edges: { from: string; to: string; weight?: number }[];
}
