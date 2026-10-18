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
  /** Shown instead of the weight when set, e.g. "3/5" for flow over capacity. */
  label?: string;
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

export interface SqlRow {
  /** Stable across steps so the renderer can follow a row. */
  id: string;
  cells: (number | string | null)[];
  role: Role;
  /** Column indexes to highlight in this row. */
  focus?: number[];
  /** Group number while GROUP BY is shown. */
  group?: number;
  /** Short mark shown at the end of the row, e.g. "kept", "removed", "no match". */
  note?: string;
}

export interface SqlTable {
  /** "orders", "after WHERE", "result". */
  label: string;
  columns: string[];
  /** One short constraint badge per column, such as "PK" or "NOT NULL"; empty strings for none. */
  columnNotes?: string[];
  rows: SqlRow[];
}

/** SQL tables at one point of a query, with the clauses the query uses. */
export interface TableView {
  kind: 'table';
  /** Clauses this query uses, in logical order. */
  clauses: string[];
  /** The clause being run. */
  current?: string;
  /** 1–3 tables: inputs, then the working or result table. */
  tables: SqlTable[];
}

/** A labelled 2-D table: DP tables, boards, and text rows aligned with null gaps. */
export interface GridView {
  kind: 'grid';
  /** Column headers, e.g. capacities 0..C or the characters of a string. */
  colLabels?: string[];
  rows: { label?: string; cells: (Cell | null)[] }[];
  /** Dependency arrows between cells, as [row, col] pairs. */
  arrows?: { from: [number, number]; to: [number, number] }[];
}

export interface CallFrame {
  id: string;
  parent?: string;
  /** e.g. "fib(4)". */
  label: string;
  /** Return value once the frame has finished. */
  result?: string;
  role: Role;
}

/** A recursion tree: one frame per call. */
export interface CallsView {
  kind: 'calls';
  frames: CallFrame[];
}

/** Values distributed into labelled buckets, e.g. radix sort's digit buckets. */
export interface BucketsView {
  kind: 'buckets';
  /** The array being distributed or collected. */
  input?: { label: string; cells: Cell[] };
  buckets: { label: string; cells: Cell[] }[];
}

/** Several views shown together in one step. Panels do not nest. */
export interface PanelsView {
  kind: 'panels';
  panels: { label?: string; view: Exclude<View, PanelsView> }[];
}

export type View =
  | ArrayView
  | ListView
  | StackView
  | QueueView
  | TreeView
  | HeapView
  | GraphView
  | TableView
  | GridView
  | CallsView
  | BucketsView
  | PanelsView;

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
