import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const FORMATS = ['CSV', 'JSON', 'Markdown'];
const CLASSES = { CSV: 'CsvExport', JSON: 'JsonExport', Markdown: 'MarkdownExport' } as const;
const USERS = [
  { name: 'Cy', email: 'cy@ex.com' },
  { name: 'Al', email: 'al@ex.com' },
  { name: 'Bo', email: '' },
  { name: 'Di', email: 'di@ex.com' },
];

export const templateMethodLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Skip users with no email',
  scenario: {
    name: 'format',
    label: 'Format',
    options: FORMATS,
    help: 'Which export to run over the 4 users: Cy, Al, Bo and Di. Bo has no email.',
  },
  run(choice, format, t) {
    const m = choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive;
    const exporter = new m[CLASSES[format as keyof typeof CLASSES] ?? 'CsvExport']();
    t.register(exporter);
    const lines = exporter.run(USERS.map((u) => ({ ...u }))).split('\n');
    return {
      ok: true,
      title: `Exported ${lines.length} lines of ${format}`,
      why: choice.pattern
        ? 'Export.run fixed the steps, sort then header, rows and footer, and the subclass filled in only what makes its format different.'
        : `${CLASSES[format as keyof typeof CLASSES] ?? 'CsvExport'}.run did every step itself: copy, sort and format. The other two exports repeat the same steps.`,
      facts: lines.map((line, i): [string, string] => [`Line ${i + 1}`, line]),
    };
  },
  notes: {
    'CsvExport.run': 'The CSV export sorts the users and formats them, all in one method.',
    'JsonExport.run': 'The JSON export sorts the users and formats them, repeating the same steps as the others.',
    'MarkdownExport.run': 'The Markdown export sorts the users and formats them, repeating the same steps again.',
    'Export.run': 'The template method, defined once in Export, runs on the subclass. It fixes the order of the steps.',
    'CsvExport.header': 'The template asks the subclass for its header.',
    'JsonExport.header': 'The template asks the subclass for its header.',
    'MarkdownExport.header': 'The template asks the subclass for its header.',
    'CsvExport.row': 'The template asks the subclass to format one user.',
    'JsonExport.row': 'The template asks the subclass to format one user.',
    'MarkdownExport.row': 'The template asks the subclass to format one user.',
    'Export.separator': 'A hook with a default: rows go on separate lines unless the subclass says otherwise.',
    'JsonExport.separator': 'JSON overrides the hook, because objects in a list need commas between them.',
    'Export.footer': 'Another hook with a default: no footer.',
    'JsonExport.footer': 'JSON overrides the hook to close the list.',
  },
};
