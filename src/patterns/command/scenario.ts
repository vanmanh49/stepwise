import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const THEN = ['Nothing', 'Undo the last action', 'Replay the macro'];
const [NOTHING, UNDO, REPLAY] = THEN as [string, string, string];

export const commandLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a macro',
  scenario: {
    name: 'after',
    label: 'Then',
    options: THEN,
    help: 'What to do after typing "Hi", typing " there" and pressing backspace. Undo needs the pattern; the macro exists only after the change.',
    patternOnly: [UNDO],
    afterChangeOnly: [REPLAY],
  },
  run(choice, then, t) {
    let editor: { text: string };
    let after: () => void = () => {};
    if (choice.pattern) {
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      const doc = new m.Editor();
      const history = new m.History();
      const toolbar = new m.Toolbar(doc, history);
      const shortcuts = new m.Shortcuts(doc, history);
      t.register(toolbar);
      t.register(shortcuts);
      toolbar.type('Hi');
      toolbar.type(' there');
      shortcuts.backspace();
      // The history already holds every action as an object, so replaying them is one more command.
      if (then === UNDO) after = () => history.undo();
      if (then === REPLAY) after = () => history.run(new m.MacroCommand([...history.done]));
      editor = doc;
    } else {
      const m = (choice.changed ? naiveChanged : naive) as typeof naiveChanged;
      const doc = new m.Editor();
      const macro = choice.changed ? new m.Macro() : undefined;
      const toolbar = new m.Toolbar(doc, macro!);
      const shortcuts = new m.Shortcuts(doc, macro!);
      t.register(toolbar);
      t.register(shortcuts);
      toolbar.type('Hi');
      toolbar.type(' there');
      shortcuts.backspace();
      if (then === REPLAY && macro) after = () => macro.replay(doc);
      editor = doc;
    }
    const typed = editor.text;
    after();
    return {
      ok: true,
      title: then === NOTHING ? `The editor holds "${editor.text}"` : `After ${then === UNDO ? 'undo' : 'the replay'}, the editor holds "${editor.text}"`,
      why:
        then === UNDO
          ? `The history took back its newest command, the delete, which put back the "e" it had saved.`
          : then === REPLAY
            ? choice.pattern
              ? 'The macro ran the same command objects again, in order.'
              : 'The macro read back its records and turned each kind into an editor call again.'
            : choice.pattern
              ? 'Every action went through the history as an object, so it can be undone or run again later.'
              : 'Each trigger called the editor directly, so nothing remembers what was done.',
      facts: [
        ['Typed', `"${typed}"`],
        ['Text', `"${editor.text}"`],
        ['Can undo', choice.pattern ? 'yes' : 'no'],
      ],
    };
  },
  notes: {
    'Toolbar.type': 'The user types on the toolbar.',
    'Shortcuts.backspace': 'The user presses backspace.',
    'History.run': 'The action arrives as an object. The history runs it and keeps it.',
    'History.undo': 'The history takes its newest command off the list and asks it to undo itself.',
    'TypeCommand.execute': 'The command knows its editor and its text, so it can type them.',
    'TypeCommand.undo': 'Typing is undone by removing as many letters as were typed.',
    'DeleteCommand.execute': 'The command deletes and saves what it removed, so it can put it back later.',
    'DeleteCommand.undo': 'The delete is undone by typing back exactly what it removed.',
    'MacroCommand.execute': 'The macro is a command made of commands. It runs each one in order.',
    'Editor.insert': 'The editor adds the text at the end.',
    'Editor.remove': 'The editor removes letters from the end and returns them.',
    'Macro.record': 'The naive macro has to be told about every action, by each trigger.',
    'Macro.replay': 'The naive macro turns each record back into a call, with an if per kind of action.',
  },
};
