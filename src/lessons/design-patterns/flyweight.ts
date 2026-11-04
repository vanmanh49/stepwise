import { flyweightLesson as lesson } from '../../patterns/flyweight/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', trees: '6 trees' });
const secondOak = steps.findIndex((step, i) => i > 2 && step.title === 'Forest#1 calls TreeFactory#1.get("oak")');

const content: LessonContent = {
  overview:
    'When a program makes thousands of similar objects, the data they all repeat can fill memory. The Flyweight pattern moves that repeated data into a few shared objects and keeps only what is unique in each one. This lesson plants a forest of oaks and pines, each with a 64-pixel texture, then adds a bark texture.',
  concept: [
    'In the naive design, every Tree builds its own texture when it is made. A tree\'s position is its own, but its texture is the same as every other tree of its species. With 24 trees, the forest holds 24 texture arrays, 1536 numbers, for what is really 2 textures.',
    'With the pattern, the shared part moves into a TreeType, one per species, and a TreeFactory hands them out. The factory builds a type the first time a species is asked for and returns the same object after that. A Tree keeps only its x, y and a reference to its type. The forest holds 2 texture arrays, 128 numbers, whether it has 6 trees or 24.',
    'Adding a bark texture costs the same code in both designs: 2 lines in 1 class, Tree in the naive design and TreeType with the pattern. The difference is memory. The naive forest goes to 48 arrays for 24 trees, and keeps growing with every tree. The pattern goes to 4 and stays there.',
    'The counts here are of arrays the code really creates, found by checking which arrays the trees can reach. They are not bytes measured from the JavaScript engine, which adds its own overhead to every object and array.',
    'In real code, Java\'s Integer.valueOf hands out one shared object for each small number, and text editors share one glyph object per character shape instead of storing the shape for every letter on the page. Game engines draw thousands of trees or blades of grass from one shared mesh the same way.',
  ],
  howItWorks: [
    'Split each object\'s data into the part shared by many (the texture) and the part unique to each (the position).',
    'Move the shared part into a small class, such as TreeType.',
    'Add a factory that keeps one of each and returns the same one every time it is asked.',
    'Each object keeps only its unique data and a reference to its shared part.',
    'Never change a shared object for one user, because every other user sees the change too.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Memory for shared data stays fixed as the object count grows', 'Shared data is built once, not once per object', 'The factory makes sharing automatic'],
    cons: ['Data is split across two objects, which is harder to read', 'Shared objects must never be changed by one user', 'A factory lookup on every creation'],
    useWhen: ['There are many objects with large data in common', 'Memory, not code, is the problem'],
    avoidWhen: ['There are only a few objects, so the saving is tiny', 'Each object needs to change its own copy of the data'],
  },
  applications: [
    'Glyph sharing in text editors and font renderers',
    'Small-number and string caches, such as Java\'s Integer.valueOf and string interning',
    'Instanced meshes for trees, grass and particles in games',
  ],
  commonMistakes: [
    'Changing a shared type for one tree, which changes every tree of that species.',
    'Keeping a copy of the shared data in each object as well, so nothing is saved.',
    'Using Flyweight for a handful of objects, where the extra classes cost more than they save.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'An oak has already been planted. The forest now asks the factory for "oak" again. What comes back?',
      view: steps[secondOak]!.view,
      options: ['TreeType#1, the same oak type as before', 'A new TreeType#3', 'TreeType#2, the pine type', 'Nothing, the factory only builds once'],
      answer: 0,
      explanation: 'The factory built the oak type the first time and returns that same object every time after.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With the pattern, how many texture arrays does a forest of 24 trees hold before the change?',
      options: ['2', '24', '12', '48'],
      answer: 0,
      explanation: 'One per species, oak and pine, shared by all 24 trees.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes the trees share their texture?',
      options: ['this.trees.push(new Tree(x, y, this.factory.get(species)));', 'this.texture = paint(species);', 'public x: number,', 'const oak = this.trees.filter((tree) => tree.type.species === \'oak\').length;'],
      answer: 0,
      explanation: 'Each tree is given the shared type from the factory instead of building a texture of its own.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'The bark change cost 2 lines in 1 class in both designs. What did the pattern save?',
      options: ['Memory: 4 arrays instead of 48', 'Code: fewer lines', 'Calls: fewer steps', 'Nothing'],
      answer: 0,
      explanation: 'Flyweight is about memory. The edit is the same size, but only the naive forest copies the bark into every tree.',
    },
  ],
  summary: [
    'Flyweight shares the data that many objects have in common.',
    'A factory hands out one shared object per kind.',
    '24 trees held 24 textures without the pattern, and 2 with it.',
    'The change cost the same code; the saving is in memory.',
  ],
};

export default content;
