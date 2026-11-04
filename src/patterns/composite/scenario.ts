import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const TREES = ['Flat', 'Nested', 'Deep', 'With a zip'];

/** A file is [name, bytes]; a folder or zip is [name, children, 'zip'?]. */
type Spec = [string, number] | [string, Spec[]] | [string, Spec[], 'zip'];

const NESTED: Spec[] = [
  ['readme.md', 100],
  ['src', [['main.ts', 300], ['util.ts', 200]]],
];

const SPECS: Record<string, Spec> = {
  Flat: ['docs', [['a.txt', 100], ['b.txt', 200], ['c.txt', 300]]],
  Nested: ['project', NESTED],
  Deep: ['root', [['a.txt', 100], ['one', [['b.txt', 200], ['two', [['c.txt', 300], ['three', [['d.txt', 400]]]]]]]]],
  'With a zip': ['project', [...NESTED, ['photos.zip', [['p1.jpg', 400], ['p2.jpg', 600]], 'zip']]],
};

type Classes = typeof patternChanged;

function build(spec: Spec, m: Classes): object {
  const [name, body, kind] = spec;
  if (typeof body === 'number') return new m.File(name, body);
  const children = body.map((child) => build(child, m)) as pattern.File[];
  return kind === 'zip' ? new m.Zip(name, children) : new m.Folder(name, children);
}

export const compositeLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add zip archives',
  scenario: {
    name: 'tree',
    label: 'Tree',
    options: TREES,
    help: 'The folder tree to measure. A zip holds files and stores them at half size, and exists only after the change.',
    afterChangeOnly: ['With a zip'],
  },
  run(choice, tree, t) {
    // Each module's own classes build the tree, so instanceof and the traced methods match the design that runs.
    const m = (choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive) as unknown as Classes;
    const root = build(SPECS[tree]!, m) as patternChanged.Folder;
    t.register(root);
    let size: number;
    let files: number;
    if (choice.pattern) {
      size = root.size();
      files = root.count();
    } else {
      const n = m as unknown as typeof naiveChanged;
      const sizes = new n.SizeReport();
      const counts = new n.CountReport();
      t.register(sizes);
      t.register(counts);
      size = sizes.total(root as unknown as naiveChanged.Folder);
      files = counts.count(root as unknown as naiveChanged.Folder);
    }
    return {
      ok: true,
      title: `${tree === 'With a zip' ? 'The tree with a zip' : `The ${tree.toLowerCase()} tree`} holds ${files} files in ${size} bytes`,
      why: choice.pattern
        ? 'Each item answered for itself, and each folder added up its children\'s answers.'
        : 'Each report walked the tree on its own, checking what kind of item every entry is.',
      facts: [
        ['Total size', `${size} bytes`],
        ['Files', String(files)],
      ],
    };
  },
  notes: {
    'Folder.size': 'A folder does not know its size. It asks every item inside it and adds up the answers.',
    'Folder.count': 'A folder asks every item inside it how many files it holds, and adds them up.',
    'File.size': 'A file knows its own size, so it answers at once.',
    'File.count': 'A file counts as one file.',
    'Zip.size': 'A zip asks its items for their size, adds them up, and halves the total, because it stores them compressed.',
    'Zip.count': 'A zip asks its items how many files they hold, like a folder.',
    'SizeReport.total': 'The size report checks each item: a file adds its bytes, a folder means walking into it.',
    'CountReport.count': 'The count report walks the same tree again, with its own copy of the same checks.',
  },
};
