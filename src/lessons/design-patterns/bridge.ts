import { bridgeLesson as lesson } from '../../patterns/bridge/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', shape: 'Circle' });
const drawn = steps.findIndex((step) => step.title === 'client calls Circle#1.draw()');

const content: LessonContent = {
  overview:
    'Some code varies in two directions at once, such as which shape to draw and how to draw it. The Bridge pattern splits those two directions into two sets of classes and joins them with one field. This lesson draws a circle and a square with a canvas and a text renderer, then adds an SVG renderer.',
  concept: [
    'In the naive design, every shape and renderer pair is its own class: CanvasCircle, CanvasSquare, TextCircle and TextSquare. That is 4 classes for 2 shapes and 2 renderers. Each class mixes two jobs, knowing the shape and knowing the drawing tool.',
    'With the pattern, the shapes are one set of classes (Circle, Square) and the renderers are another (CanvasRenderer, TextRenderer). A shape holds a renderer in a field and asks it to draw: Circle.draw() calls renderer.circle(5). The field is the bridge between the two sets.',
    'Adding SVG shows the difference. The naive design needs a new class for every shape, SvgCircle and SvgSquare, so 2 classes and 12 lines. The pattern needs 1 new class, SvgRenderer, in 8 lines, and both shapes can use it at once. With 2 shapes the saving is small. It grows with each shape: with 5 shapes, a new renderer costs 5 naive classes and still 1 with the pattern.',
    'Bridge looks like Adapter, because both put one object in front of another. Adapter fixes a mismatch after the fact, between code that already exists. Bridge is planned up front, so two parts of a design can grow on their own.',
    'In real code, JDBC is a bridge: your code talks to the same Connection and Statement classes, and a driver for PostgreSQL, MySQL or SQLite does the work underneath. Graphics toolkits split shapes from drawing backends the same way.',
  ],
  howItWorks: [
    'Find the two things that vary, such as shape and renderer.',
    'Give each its own set of classes with a shared method list.',
    'Let one side hold the other in a field, here the shape holds a renderer.',
    'The shape does its own work and passes the drawing to the renderer.',
    'A new shape or a new renderer is one class, and it works with all of the other side.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Two directions of change grow on their own', 'Classes grow as shapes + renderers, not shapes × renderers', 'You can pick the renderer at runtime'],
    cons: ['Two sets of classes and an interface between them', 'Harder to follow for a design that never grows', 'The shared method list must fit every renderer'],
    useWhen: ['A class would vary in two independent ways', 'You want to switch the implementation without touching the callers'],
    avoidWhen: ['Only one thing varies, so one set of classes is enough', 'There is a single renderer and no plan for a second'],
  },
  applications: [
    'Database drivers behind one connection API, such as JDBC or ODBC',
    'UI toolkits that draw the same widgets on different platforms',
    'Logging libraries that send the same log calls to files, consoles or services',
  ],
  commonMistakes: [
    'Splitting a design that only varies one way, which adds an interface for nothing.',
    'Letting the shape reach into a renderer\'s details, so the two sides are joined again.',
    'Putting drawing code in the shape and shape code in the renderer, so each change still touches both.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client has called draw on Circle#1, which holds a CanvasRenderer. What does Circle#1 call next?',
      view: steps[drawn]!.view,
      options: ['CanvasRenderer#1.circle(5)', 'CanvasCircle#1.draw()', 'TextRenderer#1.circle()', 'Nothing, it returns the drawing'],
      answer: 0,
      explanation: 'The circle knows its radius and hands the drawing to the renderer it holds.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without the pattern, how many classes did adding SVG need for 2 shapes?',
      options: ['2', '1', '3', '4'],
      answer: 0,
      explanation: 'Every shape needs its own SVG class: SvgCircle and SvgSquare.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is the bridge between shapes and renderers?',
      options: ['constructor(public renderer: Renderer) {}', 'radius = 5;', 'return \'( )\';', 'export class CanvasCircle {'],
      answer: 0,
      explanation: 'The shape holds a renderer in a field, and every drawing goes through it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With 5 shapes, how many classes would a new renderer need with the pattern?',
      options: ['1', '5', '6', '10'],
      answer: 0,
      explanation: 'A renderer works with every shape, so one class is enough however many shapes there are.',
    },
  ],
  summary: [
    'Bridge splits two directions of change into two sets of classes.',
    'One side holds the other in a field and passes work across it.',
    'SVG cost 2 classes without the pattern, and 1 with it.',
    'The saving grows with every shape or renderer you add.',
  ],
};

export default content;
