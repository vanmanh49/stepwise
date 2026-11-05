import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const DRAWINGS = ['One circle', '3 shapes', '6 shapes'];
type Spec = ['circle', number] | ['rect', number, number] | ['triangle', number, number];
const THREE: Spec[] = [
  ['circle', 2],
  ['rect', 3, 4],
  ['triangle', 6, 2],
];
const SPECS: Record<string, Spec[]> = {
  'One circle': [['circle', 2]],
  '3 shapes': THREE,
  '6 shapes': [...THREE, ['circle', 3], ['rect', 4, 5], ['triangle', 7, 3]],
};

type Module = typeof naive | typeof pattern;
type Visitor<R> = { visitCircle(c: pattern.Circle): R; visitRect(r: pattern.Rect): R; visitTriangle(t: pattern.Triangle): R };
const build = (m: Module, [kind, a, b]: Spec) => (kind === 'circle' ? new m.Circle(a) : kind === 'rect' ? new m.Rect(a, b) : new m.Triangle(a, b));

export const visitorLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a JSON export',
  scenario: {
    name: 'drawing',
    label: 'Drawing',
    options: DRAWINGS,
    help: 'Which shapes are in the drawing. The app works out their total area and draws them as SVG.',
  },
  run(choice, drawing, t) {
    const specs = SPECS[drawing] ?? [];
    let areas: number[];
    let svg: string[];
    let json: string[] | undefined;
    if (choice.pattern) {
      const m = choice.changed ? patternChanged : pattern;
      const shapes = specs.map((spec) => build(m, spec) as pattern.Circle | pattern.Rect | pattern.Triangle);
      const visit = <R>(v: Visitor<R>) => {
        t.register(v);
        return shapes.map((s) => s.accept(v));
      };
      areas = visit(new m.AreaVisitor());
      svg = visit(new m.SvgVisitor());
      if (choice.changed) json = visit(new patternChanged.JsonVisitor());
    } else {
      const m = choice.changed ? naiveChanged : naive;
      const shapes = specs.map((spec) => build(m, spec) as naiveChanged.Circle | naiveChanged.Rect | naiveChanged.Triangle);
      areas = shapes.map((s) => s.area());
      svg = shapes.map((s) => s.svg());
      if (choice.changed) json = shapes.map((s) => s.json());
    }
    const facts: [string, string][] = [
      ['Total area', String(areas.reduce((sum, a) => sum + a, 0))],
      ['SVG', svg.join('')],
    ];
    if (json) facts.push(['JSON', `[${json.join(',')}]`]);
    return {
      ok: true,
      title: `${json ? 'Measured, drew and exported' : 'Measured and drew'} ${specs.length === 1 ? '1 shape' : `${specs.length} shapes`}`,
      why: choice.pattern
        ? 'Each operation was a visitor. Every shape only had to accept it and call the visitor\'s method for its own kind.'
        : 'Every shape class has one method per operation, so each shape did the work itself.',
      facts,
    };
  },
  notes: {
    'Circle.area': 'The circle works out its own area.',
    'Rect.area': 'The rectangle works out its own area.',
    'Triangle.area': 'The triangle works out its own area.',
    'Circle.svg': 'The circle draws itself as SVG.',
    'Rect.svg': 'The rectangle draws itself as SVG.',
    'Triangle.svg': 'The triangle draws itself as SVG.',
    'Circle.json': 'The new export had to be added to the circle class.',
    'Rect.json': 'The new export had to be added to the rectangle class.',
    'Triangle.json': 'The new export had to be added to the triangle class.',
    'Circle.accept': 'The client hands the visitor to the shape. The shape doesn\'t know which operation this is.',
    'Rect.accept': 'The client hands the visitor to the shape. The shape doesn\'t know which operation this is.',
    'Triangle.accept': 'The client hands the visitor to the shape. The shape doesn\'t know which operation this is.',
    'AreaVisitor.visitCircle': 'The shape calls the visitor\'s method for circles, so the visitor knows exactly what it got.',
    'SvgVisitor.visitCircle': 'The shape calls the visitor\'s method for circles, so the visitor knows exactly what it got.',
    'JsonVisitor.visitCircle': 'The new export is one new visitor. The circle class did not change.',
  },
};
