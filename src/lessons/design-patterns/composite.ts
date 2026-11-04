import { compositeLesson as lesson } from '../../patterns/composite/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', tree: 'Nested' });
const asked = steps.findIndex((step) => step.title === 'client calls Folder#1.size()');

const content: LessonContent = {
  overview:
    'Trees of things are everywhere: folders in folders, menus in menus, shapes in groups. The Composite pattern gives a single item and a group of items the same methods, so code can treat the whole tree as one thing. This lesson measures a folder tree, then adds zip archives that hold files of their own.',
  concept: [
    'In the naive design, File and Folder only hold data. Two reports walk the tree: SizeReport adds up bytes and CountReport counts files. Each one checks every entry with instanceof File or instanceof Folder, so the knowledge of what kinds of items exist is copied into both.',
    'With the pattern, every item has size() and count(). A file answers for itself. A folder asks each of its items and adds up the answers, without caring whether an item is a file or another folder. The sequence shows the calls going one level deeper for each folder in the tree.',
    'Adding zip archives shows the cost. The naive design needs a new Zip class and edits 3 more: both reports get a new instanceof branch, and Folder must accept a zip as a child. That is 11 lines added and 3 removed across 3 edited classes. The pattern adds Zip in 12 lines and edits nothing, because a zip is just another item with size() and count().',
    'The two designs add about the same number of lines. The difference is where they go: the pattern puts all of them in one new class, while the naive design spreads them over code that already worked.',
    'In real code, the browser DOM is a composite: an element and a text node are both nodes, and element.textContent asks every child in turn. React components, file system APIs and scene graphs in game engines work the same way.',
  ],
  howItWorks: [
    'Choose the methods every item in the tree should answer, such as size and count.',
    'Give a single item, such as a file, those methods.',
    'Give a group, such as a folder, the same methods, which ask each child and combine the answers.',
    'Client code calls the method on the top of the tree and never checks item types.',
    'A new kind of item is one new class with the same methods.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Client code treats one item and a whole tree the same way', 'A new kind of item needs no edits elsewhere', 'Recursion follows the shape of the data'],
    cons: ['Every item must have every method, even ones that make little sense for it', 'Deep trees mean deep call chains', 'Harder to limit which items a group may hold'],
    useWhen: ['Data is a tree of parts and wholes', 'Clients should not care whether they hold one item or many'],
    avoidWhen: ['The items are too unlike to share one set of methods', 'The data is a flat list, so a loop is enough'],
  },
  applications: [
    'The DOM, where elements and text nodes are both nodes',
    'File systems, menus and organisation charts',
    'Scene graphs and UI layouts, where groups move all their children',
  ],
  commonMistakes: [
    'Forcing unlike items into one interface, so some methods throw "not supported".',
    'Letting a folder hold itself, which makes size() recurse forever.',
    'Keeping type checks in client code after adding the shared methods, so both designs exist at once.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client has called size on Folder#1, the top of the tree. What does Folder#1 call next?',
      view: steps[asked]!.view,
      options: ['File#1.size()', 'SizeReport#1.total()', 'Folder#1.count()', 'Nothing, it knows its size'],
      answer: 0,
      explanation: 'A folder does not know its size. It asks its first item, readme.md, which is File#1.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without the pattern, how many existing classes did adding zips edit?',
      options: ['3', '1', '2', '0'],
      answer: 0,
      explanation: 'Both reports got a new branch, and Folder had to accept zips as children.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets a folder measure itself without knowing what its items are?',
      options: ['return this.items.reduce((sum, item) => sum + item.size(), 0);', 'if (item instanceof File) sum += item.bytes;', 'return this.bytes;', 'public items: Item[],'],
      answer: 0,
      explanation: 'It asks every item for its size and adds them up. Files, folders and zips all answer size().',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Both designs added about a dozen lines for zips. What does the pattern save, then?',
      options: ['Edits to code that already worked', 'Memory', 'Calls at run time', 'Nothing at all'],
      answer: 0,
      explanation: 'The pattern\'s lines are all in the new Zip class. The naive lines change 3 classes that were already tested.',
    },
  ],
  summary: [
    'Composite gives a single item and a group the same methods.',
    'A group answers by asking its children and combining their answers.',
    'Zips edited 3 classes without the pattern, and none with it.',
    'The calls follow the tree, one level deeper per folder.',
  ],
};

export default content;
