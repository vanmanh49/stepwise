import { mediatorLesson as lesson } from '../../patterns/mediator/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', account: 'Company, all filled' });
const typesName = steps.findIndex((step) => step.title === 'client calls TextField#1.type("Lan")');

const content: LessonContent = {
  overview:
    'In a form, widgets depend on each other: ticking a box shows a field, and filling fields enables a button. The Mediator pattern stops the widgets from talking to each other. Each one tells a single coordinator that it changed, and the coordinator decides what happens. This lesson fills in a sign-up form for a personal or a company account, then adds a VAT number that company accounts must give.',
  concept: [
    'In the naive design, the widgets hold each other. The "Company account" checkbox holds the company field and the Submit button, each text field holds the button, and the button holds the name field, the company field and the checkbox so it can read them. SignupForm creates the widgets and wires all of that. The result counts the places where one widget points straight at another: 7.',
    'With the pattern, each widget holds only SignupDialog and calls dialog.changed(this). The dialog knows every widget, shows the company field when the box is ticked, and enables Submit when the name is filled and, for a company, the company name too. The widgets have 0 links to each other. In the Objects panel, every line goes to the dialog. Both designs give the same answer for every account.',
    'The VAT field shows the cost. Without the pattern, 3 classes change, 9 lines are added and 3 removed: the checkbox has to show the new field, the button has to read it, and the form has to wire it, and the links between widgets grow from 7 to 10. With the pattern, only SignupDialog changes, 4 lines added and 2 removed. The VAT field is just another TextField.',
    'The risk is the other side of the same coin: every rule now lives in the dialog. On a big screen the mediator can turn into one huge class that knows everything, which is hard to change in its own way.',
    'In real code, a chat room server is a mediator: users send messages to the room, never to each other. Air-traffic control works the same way for planes, and UI frameworks do it when a parent component owns the state and its children only report events up.',
  ],
  howItWorks: [
    'Make one mediator that knows every widget.',
    'Give each widget a link to the mediator only.',
    'When a widget changes, it tells the mediator, and nothing else.',
    'The mediator applies the rules and updates the other widgets.',
    'A new rule or widget changes the mediator, not the other widgets.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Widgets don\'t know each other, so each can be reused alone', 'The rules between widgets are in one place', 'Many-to-many links become one-to-many'],
    cons: ['The mediator can grow into one class that knows everything', 'One more class to read before the form makes sense', 'Every change goes through the mediator, even simple ones'],
    useWhen: ['Many objects affect each other in tangled ways', 'You want to reuse a component that currently depends on its neighbours'],
    avoidWhen: ['Only two objects talk, so a direct call is clearer', 'The mediator would end up holding the whole program\'s logic'],
  },
  applications: [
    'Dialogs and forms where fields enable or hide each other',
    'Chat room servers that relay messages between users',
    'A parent UI component that owns the state for its children',
  ],
  commonMistakes: [
    'Letting widgets keep a few direct links "just this once", which brings the tangle back.',
    'Putting unrelated logic into the mediator until it becomes a god object.',
    'Making the mediator depend on details of each widget instead of a small shared interface.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'With the pattern, the person types "Lan" into the name field. Who does TextField#1 call next?',
      view: steps[typesName]!.view,
      options: ['SignupDialog#1.changed(TextField#1)', 'SubmitButton#1.refresh()', 'Checkbox#1.toggle()', 'TextField#2.type("Lan")'],
      answer: 0,
      explanation: 'A widget only knows the dialog, so it tells the dialog it changed. The dialog then decides whether Submit may be pressed.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Before the change, how many links between widgets does the naive form have?',
      options: ['7', '0', '3', '10'],
      answer: 0,
      explanation: 'The checkbox holds 2 widgets, each text field holds the button, and the button holds 3 widgets: 7 in all. After the VAT field it is 10.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is the whole of what a widget knows about the rest of the form, with the pattern?',
      options: ['this.dialog.changed(this);', 'this.listener?.refresh();', 'this.company.visible = this.checked;', 'this.submit.refresh();'],
      answer: 0,
      explanation: 'The widget reports that it changed and leaves the rest to the dialog. The other lines are widgets reaching into each other in the naive design.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Adding the VAT field with the pattern edited which classes?',
      options: ['SignupDialog only', 'Checkbox and SubmitButton', 'TextField', 'None'],
      answer: 0,
      explanation: 'The VAT field is another TextField. Only the dialog, which holds the rules, needed to learn about it.',
    },
  ],
  summary: [
    'Mediator puts the rules between objects in one coordinator.',
    'Each widget only tells the mediator that it changed.',
    'The naive widgets had 7 links to each other; the mediated ones had 0.',
    'Adding the VAT field edited 3 classes without the pattern and 1 with it.',
  ],
};

export default content;
