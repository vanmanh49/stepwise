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

export type Category = 'data-structures' | 'algorithms';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/** Describes the inputs a lesson's visualization accepts and how steps are generated. */
export type VisualizationConfig =
  | { kind: 'sort'; initial: number[]; generate(values: number[]): Step[] }
  | {
      kind: 'search';
      initial: number[];
      target: number;
      needsSorted: boolean;
      generate(values: number[], target: number): Step[];
    }
  | { kind: 'structure'; structure: StructureDef }
  | { kind: 'graph'; graphs: Graph[]; needsStart: boolean; generate(g: Graph, start: string): Step[] };

export interface QuizQuestion {
  id: string;
  type: 'multiple-choice' | 'complexity' | 'code' | 'predict-next';
  prompt: string;
  options: string[];
  /** Index into options. */
  answer: number;
  explanation: string;
  code?: string;
  /** A visualization state shown with the question. */
  view?: View;
}

export interface ComplexityRow {
  label: string;
  best: string;
  average: string;
  worst: string;
}

export interface Lesson {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  group?: string;
  description: string;
  /** Extra search terms. */
  keywords: string[];
  /** Lesson ids recommended first. */
  prerequisites: string[];
  overview: string;
  concept: string[];
  howItWorks: string[];
  visualization: VisualizationConfig;
  /** TypeScript source; Step.codeLine refers to its lines. */
  code: string;
  complexity: {
    /** One row for an algorithm, one row per operation for a data structure. */
    rows: ComplexityRow[];
    space: string;
    note: string;
    /** Ids from the Big O chart to highlight. */
    curves: string[];
  };
  /** Lesson ids whose first complexity row is shown for comparison. */
  compareWith?: string[];
  prosCons: { pros: string[]; cons: string[]; useWhen: string[]; avoidWhen: string[] };
  applications: string[];
  commonMistakes: string[];
  quiz: QuizQuestion[];
  summary: string[];
}

export interface Topic {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  group?: string;
}
