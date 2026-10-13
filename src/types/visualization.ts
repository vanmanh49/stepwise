export type Role =
  | 'default'
  | 'active'
  | 'compare'
  | 'swap'
  | 'sorted'
  | 'found'
  | 'visited'
  | 'frontier'
  | 'discarded'
  | 'pivot';

export interface Cell {
  /** Stable across steps so renderers can animate position changes. */
  id: string;
  value: number | string;
  role: Role;
}

export interface ArrayView {
  kind: 'array';
  cells: Cell[];
  /** Pointer name → index, e.g. { i: 0, j: 1 }. */
  pointers?: Record<string, number>;
  aux?: { label: string; cells: Cell[] };
}

export interface ListView {
  kind: 'linked-list';
  nodes: Cell[];
  /** Pointer name → node index; an index equal to nodes.length points at null. */
  pointers?: Record<string, number>;
}

/** The last item is the top. */
export interface StackView {
  kind: 'stack';
  items: Cell[];
}

/** The first item is the front. */
export interface QueueView {
  kind: 'queue';
  items: Cell[];
}

export interface TreeNode {
  id: string;
  value: number;
  role: Role;
  left?: string;
  right?: string;
}

export interface TreeView {
  kind: 'tree';
  root?: string;
  nodes: TreeNode[];
}

/** Array-backed binary heap; the tree shape is derived from the index. */
export interface HeapView {
  kind: 'heap';
  items: Cell[];
}

export interface GraphNodeView {
  id: string;
  label: string;
  x: number;
  y: number;
  role: Role;
  badge?: string;
}

export interface GraphEdgeView {
  from: string;
  to: string;
  weight?: number;
  role: Role;
}

export interface GraphView {
  kind: 'graph';
  directed: boolean;
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  frontier?: { label: string; items: string[] };
  /** Per-node table: rows keyed by node label. */
  table?: { columns: string[]; rows: Record<string, string[]> };
}

export type View = ArrayView | ListView | StackView | QueueView | TreeView | HeapView | GraphView;

export interface Step {
  /** What happened. */
  title: string;
  /** Why it happened. */
  why: string;
  /** What happens next. */
  next?: string;
  /** 1-based line in the lesson's code. */
  codeLine?: number;
  variables?: Record<string, string | number>;
  view: View;
}
