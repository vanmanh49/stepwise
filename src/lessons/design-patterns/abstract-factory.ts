import { abstractFactoryLesson as lesson } from '../../patterns/abstract-factory/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', theme: 'Dark' });
const buttonMade = steps.findIndex((step) => step.title.startsWith('DarkFactory#1 returns DarkButton#1'));

const content: LessonContent = {
  overview:
    'Some objects only make sense together, such as the buttons and dialogs of one theme. The Abstract Factory pattern gives each family its own factory, so code that takes its parts from one factory can\'t mix families. This lesson draws two screens in Light and Dark, finds a screen that mixes them, and then adds a High contrast theme.',
  concept: [
    'In the naive design, each screen checks the theme itself and picks each widget class. The settings screen does it right. The about screen checks the theme for its button but always makes a light dialog. Pick Dark and that screen shows a dark button on a light dialog.',
    'Nothing warned about it, because the bug looks fine in the Light theme. That is the risk of copying the same check into many places: one copy drifts, and only some inputs show it.',
    'With the pattern, there is one factory per theme: LightFactory and DarkFactory, each with createButton and createDialog. A screen is handed one factory and asks it for every widget, so it can only get parts of one theme. It never names a widget class at all.',
    'Adding High contrast shows the cost. The naive design adds 2 widget classes and edits both screens, 11 lines in all, and the about screen still forgets its dialog. The pattern adds the 2 widgets and a ContrastFactory, 10 lines, and edits nothing. Without the pattern, a screen is free to pair any button with any dialog.',
    'In real code, Java\'s Swing look-and-feel classes and cross-platform UI kits work this way: one object hands out matching parts for Windows, macOS or Linux, and a database driver hands out a matching connection, statement and result set.',
  ],
  howItWorks: [
    'List the kinds of part a family needs, such as a button and a dialog.',
    'Write one factory per family, with a create method for each part.',
    'Hand a client a single factory.',
    'The client asks that factory for every part it needs.',
    'A new family is a new factory and its parts, with no edits to clients.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Parts from one factory always match', 'Clients never name concrete classes', 'A new family needs no edits to clients'],
    cons: ['A new kind of part means editing every factory', 'Many small classes', 'Overkill when there is only one family'],
    useWhen: ['Objects come in families that must not be mixed', 'You switch the whole family at once, such as a theme or a platform'],
    avoidWhen: ['There is one family and no sign of a second', 'New kinds of part are added more often than new families'],
  },
  applications: [
    'UI themes and look-and-feel kits',
    'Cross-platform toolkits that hand out native widgets',
    'Database drivers that create matching connections, statements and results',
  ],
  commonMistakes: [
    'Handing a client two factories. Then it can mix families again.',
    'Adding a new kind of part, such as a menu, without adding it to every factory.',
    'Checking the theme inside the client anyway. The factory is the only place that should know.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'DarkFactory#1 has just made the settings screen\'s button. The screen needs a dialog next. Who makes it?',
      view: steps[buttonMade]!.view,
      options: ['DarkFactory#1 again', 'The screen, with new DarkDialog()', 'A LightFactory', 'The client'],
      answer: 0,
      explanation: 'The screen asks the same factory for every part, which is why the parts always match.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why did the naive bug only show in the Dark theme?',
      options: ['Its dialog is always light', 'Dark was added later', 'Dark has no dialog class', 'Light screens skip the check'],
      answer: 0,
      explanation: 'The about screen always makes a light dialog. In Light that happens to be right, so the bug stays hidden.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line guarantees the dialog matches the button?',
      options: ['const dialog = this.factory.createDialog();', 'const dialog = new LightDialog();', 'let button = new LightButton();', 'return [button.render(), dialog.render()];'],
      answer: 0,
      explanation: 'The dialog comes from the same factory as the button, so they belong to the same theme.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which change is expensive with an Abstract Factory?',
      options: ['Adding a new kind of part to every family', 'Adding a new family', 'Switching theme at startup', 'Adding a new screen'],
      answer: 0,
      explanation: 'A new part, such as a menu, means a new create method in every factory. A new family is just one more factory.',
    },
  ],
  summary: [
    'An Abstract Factory makes a whole family of matching objects.',
    'A client asks one factory for every part, so it can\'t mix families.',
    'The naive about screen mixed dark and light, and no factory means no guard against it.',
    'New families are cheap; new kinds of part are not.',
  ],
};

export default content;
