import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const SHAPES = ['Circle', 'Square'] as const;

/** Each renderer's label in the result, and its class-name prefix in the naive design. */
const RENDERERS = [
  ['Canvas', 'Canvas'],
  ['Text', 'Text'],
  ['SVG', 'Svg'],
] as const;

type Drawable = { draw(): string };

export const bridgeLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add an SVG renderer',
  scenario: {
    name: 'shape',
    label: 'Shape',
    options: [...SHAPES],
    help: 'The shape to draw. It is drawn once with every renderer the code has.',
  },
  run(choice, shape, t) {
    const classes = (choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive) as Record<string, unknown>;
    const facts: [string, string][] = [];
    for (const [label, prefix] of RENDERERS) {
      let drawable: Drawable;
      if (choice.pattern) {
        const Renderer = classes[`${prefix}Renderer`] as (new () => pattern.CanvasRenderer) | undefined;
        if (!Renderer) continue;
        // The module that runs is the one traced, so its own Circle or Square is used.
        const Shape = classes[shape] as typeof pattern.Circle;
        drawable = new Shape(new Renderer());
      } else {
        const Pair = classes[`${prefix}${shape}`] as (new () => Drawable) | undefined;
        if (!Pair) continue;
        drawable = new Pair();
      }
      t.register(drawable);
      facts.push([label, drawable.draw()]);
    }
    const count = Object.keys(classes).length;
    return {
      ok: true,
      title: `The ${shape.toLowerCase()} is drawn ${facts.length} ways`,
      why: choice.pattern
        ? `One ${shape} class is paired with each of the ${facts.length} renderers it is given.`
        : `Each way of drawing it is its own class, such as ${RENDERERS[0][1]}${shape}.`,
      facts: [...facts, ['Classes', String(count)]],
    };
  },
  notes: {
    'Circle.draw': 'The circle knows its radius. It asks whichever renderer it holds to draw a circle of that size.',
    'Square.draw': 'The square knows its side. It asks whichever renderer it holds to draw a square of that size.',
    'CanvasRenderer.circle': 'The canvas renderer turns a radius into a canvas arc command.',
    'CanvasRenderer.square': 'The canvas renderer turns a side into a canvas rect command.',
    'TextRenderer.circle': 'The text renderer draws a circle as plain characters.',
    'TextRenderer.square': 'The text renderer draws a square as plain characters.',
    'SvgRenderer.circle': 'The new SVG renderer turns a radius into an SVG circle tag.',
    'SvgRenderer.square': 'The new SVG renderer turns a side into an SVG rect tag.',
  },
};
