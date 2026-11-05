import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const EXPRESSIONS = ['2 + 3', 'x * (y + 1)', 'max(x, y) + 1'];
const CONTEXT = { x: 4, y: 5 };

/** The node classes of one design. The unchanged designs have no Max, which only after-change options use. */
interface Nodes<T> {
  Num: new (n: number) => T;
  Var: new (name: string) => T;
  Add: new (left: T, right: T) => T;
  Mul: new (left: T, right: T) => T;
  Max: new (left: T, right: T) => T;
}
type NaiveExpr = naiveChanged.Num | naiveChanged.Var | naiveChanged.Add | naiveChanged.Mul | naiveChanged.Max;
type PatternExpr = patternChanged.Num | patternChanged.Var | patternChanged.Add | patternChanged.Mul | patternChanged.Max;

/** The syntax tree for each option, built from the running design's classes. */
function tree<T>(m: Nodes<T>, expression: string): T {
  if (expression === EXPRESSIONS[0]) return new m.Add(new m.Num(2), new m.Num(3));
  if (expression === EXPRESSIONS[1]) return new m.Mul(new m.Var('x'), new m.Add(new m.Var('y'), new m.Num(1)));
  return new m.Add(new m.Max(new m.Var('x'), new m.Var('y')), new m.Num(1));
}

export const interpreterLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add max(a, b)',
  scenario: {
    name: 'expression',
    label: 'Expression',
    options: EXPRESSIONS,
    afterChangeOnly: [EXPRESSIONS[2]!],
    help: 'The expression to evaluate, with x = 4 and y = 5. max(a, b) exists only after the change.',
  },
  run(choice, expression, t) {
    let value: number;
    let printed: string;
    if (choice.pattern) {
      const root = tree<PatternExpr>((choice.changed ? patternChanged : pattern) as typeof patternChanged, expression);
      value = root.interpret(CONTEXT);
      printed = root.print();
    } else {
      const m = (choice.changed ? naiveChanged : naive) as typeof naiveChanged;
      const root = tree<NaiveExpr>(m, expression);
      const evaluator = new m.Evaluator();
      const printer = new m.Printer();
      t.register(evaluator);
      t.register(printer);
      value = evaluator.evaluate(root, CONTEXT);
      printed = printer.print(root);
    }
    return {
      ok: true,
      title: `${printed} is ${value}`,
      why: choice.pattern
        ? 'Each node interpreted itself: the root asked its children for their values, and so on down the tree.'
        : 'Evaluator and Printer each walked the tree, checking with instanceof what kind of node they had at every step.',
      facts: [
        ['Value', String(value)],
        ['Printed', printed],
        ['Context', 'x = 4, y = 5'],
      ],
    };
  },
  notes: {
    'Evaluator.evaluate': 'The evaluator checks which kind of node this is, then works out its value, asking again for each child.',
    'Printer.print': 'The printer checks which kind of node this is, then writes it as text, asking again for each child.',
    'Num.interpret': 'A number is its own value.',
    'Var.interpret': 'A variable looks up its value in the context.',
    'Add.interpret': 'An addition asks both sides for their values and adds them.',
    'Mul.interpret': 'A multiplication asks both sides for their values and multiplies them.',
    'Max.interpret': 'The new max node asks both sides for their values and keeps the larger one.',
    'Num.print': 'A number prints itself.',
    'Var.print': 'A variable prints its name.',
    'Add.print': 'An addition prints both sides with a + between them.',
    'Mul.print': 'A multiplication prints both sides, putting an addition in parentheses.',
    'Max.print': 'The new max node prints itself as max(a, b).',
  },
};
