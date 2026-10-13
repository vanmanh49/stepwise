import type { Step, View } from './visualization';

export interface Graph {
  id: string;
  name: string;
  directed: boolean;
  /** x and y are positions in a 0–100 box. */
  nodes: { id: string; label: string; x: number; y: number }[];
  edges: { from: string; to: string; weight?: number }[];
}

export interface StructureOp {
  id: string;
  label: string;
  /** Numeric inputs shown in the UI; `sample` is the initial field value. */
  args: { name: string; label: string; sample: number }[];
  /** Must not mutate `state`. Invalid operations return one explanatory step and the same state. */
  run(state: number[], args: number[]): { steps: Step[]; state: number[] };
}

export interface StructureDef {
  initial: number[];
  view(state: number[]): View;
  ops: StructureOp[];
  code: string;
}
