import { interpreterLesson as lesson } from '../../patterns/interpreter/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', expression: 'x * (y + 1)' });
const intoAdd = steps.findIndex((step) => step.title === 'Mul#1 calls Add#1.interpret({…})');

const content: LessonContent = {
  overview:
    'A small language, such as a formula, a search filter or a rule, can be run by turning each sentence into a tree of objects and letting each object work out its own part. That is the Interpreter pattern. This lesson evaluates and prints expressions such as x * (y + 1), with x = 4 and y = 5, then adds a max(a, b) function to the language.',
  concept: [
    'Both designs start from the same tree. x * (y + 1) is a Mul whose left side is the variable x and whose right side is an Add of y and 1. This lesson builds the trees directly; turning text into a tree is a parser\'s job, which comes before the interpreter.',
    'In the naive design, the node classes hold only data. An Evaluator and a Printer each walk the tree, checking with instanceof whether a node is a Num, a Var, an Add or a Mul. With the pattern, each node class has interpret(ctx) and print(). Mul.interpret asks both sides for their values and multiplies them, and the calls nest just like the tree: Mul asks Var x for 4, then asks Add, which asks y for 5 and 1 for 1. Both designs give 24 and print x * (y + 1).',
    'Adding max(a, b) is a new kind of node. Without the pattern, the Max class is added and both walkers gain a branch, so Evaluator and Printer are edited, 9 lines added and 1 removed. With the pattern, Max is one new class of 12 lines that interprets and prints itself, and nothing else changes. max(x, y) + 1 gives 6.',
    'This is the opposite trade-off to Visitor. Here a new kind of node is cheap. A new operation, such as simplifying an expression, would add a method to every node class, which is where a visitor would do better.',
    'In real code, regular expression engines, SQL WHERE clause evaluators, template languages and spreadsheet formulas all build a tree and interpret it. The SQL lessons on this site run on such an interpreter. For a bigger language, a parser generator and a compiler usually take over.',
  ],
  howItWorks: [
    'Write the language\'s grammar as classes: one per kind of expression.',
    'Turn each sentence into a tree of those objects, with a parser or by hand.',
    'Give every class interpret(ctx), which works out its value from its children.',
    'Leaves such as numbers and variables answer directly; the context holds variable values.',
    'A new kind of expression is one new class.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Each rule of the language is one small class', 'A new kind of expression needs no change to the others', 'Easy to see how a sentence is evaluated'],
    cons: ['A new operation changes every node class', 'Many classes for a big grammar', 'Walking a tree of objects is slow for heavy use'],
    useWhen: ['The language is small, such as filters, rules or formulas', 'New kinds of expressions are added more often than new operations'],
    avoidWhen: ['The language is big or must be fast, where a parser generator and compiler fit better', 'New operations are added more often than new node kinds, which suits Visitor'],
  },
  applications: [
    'Spreadsheet formulas and calculators',
    'Search filters and rule engines',
    'SQL WHERE clauses and regular expressions',
  ],
  commonMistakes: [
    'Mixing parsing text into the node classes instead of keeping it in a parser.',
    'Forgetting to fail clearly on an unknown variable, so a missing value turns into NaN.',
    'Growing a small interpreter into a full language without the tools a real language needs.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Mul#1 has its left value, 4, and now asks Add#1 for the right side. What happens next?',
      view: steps[intoAdd]!.view,
      options: ['Add#1 calls Var#2.interpret({…})', 'Add#1 returns 6', 'Mul#1 returns 24', 'Mul#1 calls Num#1.interpret({…})'],
      answer: 0,
      explanation: 'Add has to ask its own children first, starting with the variable y. Only then can it return 5 + 1 = 6.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With x = 4 and y = 5, what is max(x, y) + 1?',
      options: ['6', '5', '10', '24'],
      answer: 0,
      explanation: 'max(4, 5) is 5, and 5 + 1 is 6.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets an addition work out its value without knowing what its sides are?',
      options: ['return this.left.interpret(ctx) + this.right.interpret(ctx);', 'if (node instanceof Add) return this.evaluate(node.left, ctx) + this.evaluate(node.right, ctx);', 'return this.n;', "const value = ctx[this.name];"],
      answer: 0,
      explanation: 'Each side interprets itself, whatever kind of node it is. The instanceof line is the naive evaluator checking node kinds.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With the pattern, what would adding a simplify operation cost?',
      options: ['A new method in every node class', 'One new class', 'Nothing', 'A change to Max only'],
      answer: 0,
      explanation: 'Operations live in the node classes, so a new one is a method in each. That is the case where a visitor does better.',
    },
  ],
  summary: [
    'Interpreter turns sentences of a small language into a tree of objects.',
    'Each node works out its own value, asking its children first.',
    'Adding max edited 2 classes without the pattern and none with it.',
    'New node kinds are cheap here; new operations are cheap with Visitor.',
  ],
};

export default content;
