import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import { visitorLesson as lesson } from '../../patterns/visitor/scenario';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', drawing: '3 shapes' });
const accept = steps.findIndex((step) => step.title === 'client calls Circle#1.accept(SvgVisitor#1)');

const content: LessonContent = {
  overview:
    'When a fixed set of classes keeps getting new operations, adding each operation to every class gets tiring. The Visitor pattern moves each operation into its own class, a visitor, that has one method per kind of element. This lesson measures and draws circles, rectangles and triangles, then adds a JSON export.',
  concept: [
    'In the naive design, Circle, Rect and Triangle each have area() and svg(). That is plain object-oriented code, and reading one shape tells you everything about it. But every new operation is a new method in every shape class.',
    'With the pattern, each operation is a visitor: AreaVisitor and SvgVisitor each have visitCircle, visitRect and visitTriangle. A shape has only accept(visitor), which calls the visitor\'s method for its own kind. This is called double dispatch. Watch the sequence: the client calls Circle#1.accept(SvgVisitor#1), and the circle calls SvgVisitor#1.visitCircle(Circle#1). The first call picks the shape, the second picks the operation. Both designs give the same results, a total area of 31 and the same SVG for the 3 shapes.',
    'The JSON export shows the trade-off. Without the pattern, all 3 shape classes are edited, 9 lines added. With the pattern, JsonVisitor is a new class of 11 lines, and no existing class changes. The pattern adds a little more code, but in a new file instead of inside every shape.',
    'The other direction costs more. Adding a new shape, say a hexagon, means a new visit method in every visitor, which is exactly the edit-everything problem the naive design had for operations. Visitor fits when the kinds of elements are stable and the operations keep growing. The Interpreter lesson shows the opposite choice.',
    'In real code, compilers and linters walk syntax trees with visitors: Babel and ESLint plugins write a visitor object with a method per node type, such as Identifier or CallExpression. Java\'s FileVisitor walks a file tree the same way.',
  ],
  howItWorks: [
    'Give each element class an accept(visitor) method.',
    'accept calls the visitor\'s method for that element, such as visitCircle(this).',
    'Each operation is a visitor class with one method per element kind.',
    'To run an operation, pass its visitor to every element.',
    'A new operation is one new visitor; the element classes don\'t change.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['A new operation needs no change to the element classes', 'All the code for one operation is in one class', 'Element classes stay small'],
    cons: ['A new element kind changes every visitor', 'Double dispatch is harder to follow than a plain method call', 'Visitors often need the elements\' fields to be public'],
    useWhen: ['The kinds of elements rarely change, but operations on them are added often', 'Operations need to be kept out of the element classes, such as compiler passes'],
    avoidWhen: ['New element kinds are added often', 'There are one or two operations, which fit fine as methods'],
  },
  applications: [
    'Babel and ESLint plugins that visit syntax tree nodes',
    'Compiler passes such as type checking and code generation',
    'Exporters and reports over a fixed document model',
  ],
  commonMistakes: [
    'Using Visitor when element kinds change often, so every visitor is edited each time.',
    'Putting a switch on the element type inside the visitor, which skips the double dispatch.',
    'Letting visitors change the elements as they walk, which makes the order of visits matter.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client handed SvgVisitor#1 to the circle. What does the circle do next?',
      view: steps[accept]!.view,
      options: ['Circle#1 calls SvgVisitor#1.visitCircle(Circle#1)', 'Circle#1 returns its SVG itself', 'SvgVisitor#1 calls Circle#1.svg()', 'Circle#1 calls SvgVisitor#1.visitRect(Circle#1)'],
      answer: 0,
      explanation: 'accept calls the visitor\'s method for circles, passing itself. That second call is what picks the right code for this shape.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Adding the JSON export without the pattern, how many classes were edited?',
      options: ['3', '0', '1', '4'],
      answer: 0,
      explanation: 'Every shape class needed a json() method: Circle, Rect and Triangle.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is the shape\'s half of the double dispatch?',
      options: ['return v.visitCircle(this);', 'return Math.round(Math.PI * c.r * c.r);', 'return r.w * r.h;', 'return `<circle r="${c.r}"/>`;'],
      answer: 0,
      explanation: 'Inside accept, the circle calls the visitor\'s method for circles: the second call, which picks the code for this shape. The other lines are inside visitors, doing one operation\'s work.'
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With the pattern, what would adding a Hexagon shape cost?',
      options: ['A new visit method in every visitor', 'Nothing beyond the Hexagon class', 'One change to AreaVisitor only', 'A change to every shape class'],
      answer: 0,
      explanation: 'Each visitor has one method per shape kind, so a new kind is a new method in AreaVisitor, SvgVisitor and JsonVisitor.',
    },
  ],
  summary: [
    'Visitor puts each operation in its own class.',
    'accept on the element, then visitX on the visitor: double dispatch.',
    'The JSON export edited 3 shape classes without the pattern and none with it.',
    'A new element kind is the expensive change with Visitor.',
  ],
};

export default content;
