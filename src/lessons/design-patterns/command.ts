import { commandLesson as lesson } from '../../patterns/command/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', after: 'Undo the last action' });
const undo = steps.findIndex((step) => step.title === 'client calls History#1.undo()');

const content: LessonContent = {
  overview:
    'Buttons, menus and keyboard shortcuts all ask a program to do things. The Command pattern turns each request into an object that knows how to run itself, so requests can be kept, undone, queued or replayed. This lesson types "Hi", types " there" and presses backspace in a small editor, then adds a macro that replays those actions.',
  concept: [
    'In the naive design, the Toolbar and the keyboard Shortcuts call the editor directly: editor.insert("Hi"), editor.remove(1). The editor ends up holding "Hi ther", but nothing remembers what was done, so there is no way to undo. Undo is not offered for the naive design for that reason.',
    'With the pattern, each action is an object. TypeCommand and DeleteCommand know their editor and their data, and have execute() and undo(). The triggers build a command and hand it to the History, which runs it and keeps it. Undo is one line: take the newest command and call its undo(). DeleteCommand saved the "e" it removed, so undoing it gives "Hi there".',
    'Adding a macro shows the cost. The naive design needs a Macro class that stores each action as a record with a kind, an if for each kind to turn records back into calls, and edits to both triggers so they record what they do: 16 lines added and 2 removed, 2 classes edited. With the pattern, the history is already a list of commands, so MacroCommand is a command made of commands, 9 lines, and nothing else changes. Both macros replay to "Hi therHi ther". The macro reuses the history\'s own command objects, which is safe here because each delete saves what it removes again every time it runs.',
    'Commands cost a class per action, and a command that can\'t be undone cleanly, such as sending an email, still needs care. Undo also only works if every change goes through the history; one direct call to the editor and the history no longer matches the text.',
    'In real code, undo stacks in editors such as VS Code and Photoshop keep command objects. Redux actions are commands kept in a log, job queues store commands to run later, and database migrations are commands with an up and a down step.',
  ],
  howItWorks: [
    'Give every command the same methods, such as execute() and undo().',
    'Make one class per action, holding what it needs to run: the editor and the text.',
    'Let triggers build a command instead of doing the work themselves.',
    'Run commands through a history that keeps them.',
    'Undo, redo, queues and macros all work on the kept command objects.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Undo and redo come from the kept history', 'Requests can be stored, queued, logged or replayed', 'Triggers don\'t need to know how an action works'],
    cons: ['One class per action', 'Every change must go through the history, or undo breaks', 'Some actions can\'t be undone, such as sending a message'],
    useWhen: ['You need undo, redo, macros or a log of actions', 'Requests should be queued or run later'],
    avoidWhen: ['A button does one simple thing that never needs undo or replay', 'Actions have outside effects that can\'t be taken back'],
  },
  applications: [
    'Undo stacks in editors and design tools',
    'Redux actions and other event logs',
    'Job queues and database migrations with up and down steps',
  ],
  commonMistakes: [
    'Changing the document directly somewhere, so the history no longer matches it.',
    'Forgetting to save what a delete removed, so undo has nothing to put back.',
    'Reusing a command object that keeps state from its last run, so a replay undoes the wrong thing.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client has asked the history to undo. Its newest command is the backspace. What does History#1 call next?',
      view: steps[undo]!.view,
      options: ['DeleteCommand#1.undo()', 'TypeCommand#2.undo()', 'Editor#1.insert("e")', 'Shortcuts#1.backspace()'],
      answer: 0,
      explanation: 'Undo takes the newest command off the list, the delete, and asks it to undo itself. The delete then puts back the "e".',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without the pattern, how many existing classes did the macro edit?',
      options: ['2', '0', '1', '3'],
      answer: 0,
      explanation: 'Both the Toolbar and the Shortcuts had to be edited to record what they do.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes undoing a delete possible?',
      options: ['this.removed = this.editor.remove(this.count);', 'this.editor.remove(1);', 'this.done.push(command);', 'for (const command of this.commands) command.execute();'],
      answer: 0,
      explanation: 'The delete saves what it removed, so its undo can type exactly that back.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why was the macro only 9 lines with the pattern?',
      options: ['The history already held every action as an object', 'Macros need no code', 'The editor records itself', 'The triggers were edited'],
      answer: 0,
      explanation: 'Replaying is just running the kept command objects again, so the macro is a command that holds a list of commands.',
    },
  ],
  summary: [
    'Command turns each request into an object with execute() and undo().',
    'A history of commands gives undo, redo and replay.',
    'The macro edited 2 classes without the pattern, and none with it.',
    'Every change must go through the history for undo to stay right.',
  ],
};

export default content;
