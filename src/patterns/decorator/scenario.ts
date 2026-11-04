import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const LAYERS = ['Logging + Compression', 'Logging', 'Compression', 'Compress, then encrypt', 'Encrypt, then compress'];
const DATA = 'aaaaaaaabbbbbbbbcccccccc';

type Sink = { write(data: string): number; stored?: string; log?: string[] };

/** The naive design's one class for each choice: it has no way to stack layers. */
const NAIVE_CLASS: Record<string, keyof typeof naiveChanged> = {
  Logging: 'LoggingSink',
  Compression: 'CompressingSink',
  'Logging + Compression': 'LoggingCompressingSink',
  'Compress, then encrypt': 'CompressingEncryptingSink',
};

/** The pattern's stack for each choice, outermost first: the data passes through them in this order. */
const STACK: Record<string, ('LoggingSink' | 'CompressingSink' | 'EncryptingSink')[]> = {
  Logging: ['LoggingSink'],
  Compression: ['CompressingSink'],
  'Logging + Compression': ['LoggingSink', 'CompressingSink'],
  'Compress, then encrypt': ['CompressingSink', 'EncryptingSink'],
  'Encrypt, then compress': ['EncryptingSink', 'CompressingSink'],
};

export const decoratorLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add encryption',
  scenario: {
    name: 'layers',
    label: 'Layers',
    options: LAYERS,
    help: 'What happens to the data on its way to the file. Encryption exists only after the change.',
    afterChangeOnly: ['Compress, then encrypt', 'Encrypt, then compress'],
    patternOnly: ['Encrypt, then compress'],
  },
  run(choice, layers, t) {
    let outer: Sink;
    let file: Sink;
    let logger: Sink | undefined;
    let classes: number;
    if (choice.pattern) {
      // The unchanged module has no EncryptingSink, and encryption is refused before the change.
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      classes = Object.keys(choice.changed ? patternChanged : pattern).length;
      file = new m.FileSink();
      outer = file;
      for (const name of STACK[layers]!.toReversed()) {
        outer = new m[name](outer);
        if (name === 'LoggingSink') logger = outer;
      }
    } else {
      const m = (choice.changed ? naiveChanged : naive) as typeof naiveChanged;
      classes = Object.keys(choice.changed ? naiveChanged : naive).length;
      outer = new m[NAIVE_CLASS[layers]!]();
      file = outer;
      logger = outer;
    }
    t.register(outer);
    const size = outer.write(DATA);
    const log = logger?.log ?? [];
    return {
      ok: size === file.stored!.length,
      title: `The file holds ${size} bytes`,
      why: choice.pattern
        ? `The data passed through ${STACK[layers]!.length} ${STACK[layers]!.length === 1 ? 'layer' : 'layers'}, each wrapping the next, before reaching the file.`
        : `One class does every step for "${layers}", because subclasses can't be stacked.`,
      facts: [
        ['Data in', `${DATA.length} bytes`],
        ['Stored', `${size} bytes`],
        ['Log', log.join(', ') || 'nothing logged'],
        ['Sink classes', String(classes)],
      ],
    };
  },
  notes: {
    'LoggingSink.write': 'The logging layer writes a line, then passes the same data on.',
    'CompressingSink.write': 'This layer squeezes runs of the same letter, such as aaaaaaaa into a8, then passes the result on.',
    'EncryptingSink.write': 'This layer scrambles each byte with a key, then passes the result on. It is a toy, not real encryption.',
    'FileSink.write': 'The file stores whatever reaches it and reports its size.',
    'LoggingCompressingSink.write': 'One class logs and compresses, because a naive subclass can\'t be combined with another.',
    'CompressingEncryptingSink.write': 'One class compresses and then encrypts, in an order fixed inside it.',
  },
};
