import type { DatasetId } from '../sql/datasets';
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

export interface TextOp {
  id: string;
  label: string;
  /** Optional single input shown beside the button. */
  arg?: { label: string; sample: string; numeric?: boolean };
  /** Invalid operations return one explanatory step and the same text. */
  run(text: string, arg: string): { steps: Step[]; text: string };
}

/** Like StructureDef, for structures whose contents are text rather than numbers. */
export interface TextDef {
  initial: string;
  view(text: string): View;
  ops: TextOp[];
  code: string;
}

export type Category = 'data-structures' | 'algorithms' | 'sql';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/** Describes the inputs a lesson's visualization accepts and how steps are generated. */
export type VisualizationConfig =
  | {
      kind: 'sort';
      initial: number[];
      /** Largest value the Random button produces; defaults to 99. */
      randomMax?: number;
      /** Smallest value the Random button produces; defaults to 1. */
      randomMin?: number;
      generate(values: number[]): Step[];
    }
  | {
      kind: 'search';
      initial: number[];
      target: number;
      needsSorted: boolean;
      /** Label of the second field; defaults to "Target". */
      targetLabel?: string;
      targetHelp?: string;
      /** Picks a sensible second value for random data; defaults to a value from the list. */
      randomTarget?(values: number[]): number;
      generate(values: number[], target: number): Step[];
    }
  | { kind: 'structure'; structure: StructureDef }
  | { kind: 'text'; text: TextDef }
  | {
      kind: 'graph';
      graphs: Graph[];
      needsStart: boolean;
      /** Shows a goal node select; the goal defaults to the graph's last node. */
      needsGoal?: boolean;
      generate(g: Graph, start: string, goal?: string): Step[];
    }
  | {
      kind: 'form';
      fields: FormField[];
      /** Quick-fill chips; the first is loaded when the lesson opens. */
      presets: { label: string; values: Record<string, string> }[];
      /** Parses its own fields; unusable input yields one explanatory step. */
      generate(values: Record<string, string>): Step[];
    }
  | {
      kind: 'sql';
      dataset: DatasetId;
      /** Shown and run when the lesson opens. */
      initialQuery: string;
      /** "Try" chips that load and run a query. */
      examples: { label: string; query: string }[];
      exercises: SqlExercise[];
    };

export interface FormField {
  name: string;
  label: string;
  /** "numbers" is a comma-separated list; "choice" is a select over options. */
  type: 'number' | 'numbers' | 'text' | 'choice';
  sample: string;
  options?: string[];
  help?: string;
}

export interface SqlExercise {
  /** Unique within the lesson. */
  id: string;
  prompt: string;
  /** Reference query; the learner's result is compared with its result. */
  solution: string;
  /** True only when the task asks for an order. */
  orderMatters: boolean;
  hint?: string;
  /**
   * For exercises that change data: statements run after the learner's script and after the
   * solution, each on the database that script left behind. Their outcomes must match.
   */
  probes?: string[];
}

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
  /** TypeScript source, or the example query for SQL lessons; Step.codeLine refers to its lines. */
  code: string;
  /** Absent for SQL lessons, where Big O does not apply. */
  complexity?: {
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
