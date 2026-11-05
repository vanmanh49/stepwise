import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import { templateMethodLesson as lesson } from '../../patterns/template-method/scenario';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', format: 'JSON' });
const gotHeader = steps.findIndex((step) => step.title === 'JsonExport#1 returns "["');

const content: LessonContent = {
  overview:
    'Sometimes several classes do the same job in the same steps and differ only in a few details. The Template Method pattern writes the steps once, in a base class, and lets each subclass fill in only the details. This lesson exports 4 users, Cy, Al, Bo and Di, as CSV, JSON and a Markdown table, then asks every export to skip users with no email.',
  concept: [
    'In the naive design, CsvExport, JsonExport and MarkdownExport each have a run method that copies the users, sorts them by name and formats them. The formatting is different, but the copy and sort are the same line, written three times.',
    'With the pattern, the abstract class Export has the one run method, the template. It sorts the users, then asks for the header, one row per user, the separator between rows and the footer, in that order. Each subclass fills in header and row. separator and footer are hooks: they have a default in Export, and only JsonExport overrides them, to put commas between objects and close the list with ]. Watch the sequence: run is defined in Export but runs on JsonExport#1, and it calls back into the subclass for each step.',
    'Skipping users with no email is a change to a shared step. Without the pattern, it is the same edit in all 3 export classes, 3 lines added and 3 removed, and forgetting one would make the formats disagree. With the pattern, Export changes in 1 line, and all three formats drop Bo.',
    'The cost is inheritance. Subclasses depend on the base class\'s order of steps and can\'t change it. If one format needs the steps in a different order, the template gets in the way, and passing the differing parts in as objects, as Strategy does, works better.',
    'In real code, test frameworks use template methods: the runner fixes the order, setUp, the test, tearDown, and your test class fills in the parts. React\'s class components did the same with lifecycle methods such as componentDidMount, and Java\'s AbstractList implements most of a list on top of the get and size you write.',
  ],
  howItWorks: [
    'Write the steps of the job once, as a method in a base class: the template.',
    'Make the parts that differ abstract methods that subclasses must fill in.',
    'Give optional parts a default, as hooks that subclasses may override.',
    'Each subclass writes only what is special about it.',
    'A change to a shared step is made once, in the template.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Shared steps are written once', 'Every subclass follows the same order of steps', 'Subclasses only write what differs'],
    cons: ['Subclasses are tied to the base class through inheritance', 'The order of steps is fixed for everyone', 'Following the code means jumping between the base class and the subclass'],
    useWhen: ['Several classes do the same steps and differ only in some of them', 'The order of the steps must be the same everywhere'],
    avoidWhen: ['Subclasses need to change the order of the steps', 'The parts that differ are easier to pass in as objects, as in Strategy'],
  },
  applications: [
    'setUp and tearDown hooks in test frameworks',
    'Lifecycle methods in UI component classes',
    'Base classes such as AbstractList, where you write a few methods and inherit the rest',
  ],
  commonMistakes: [
    'Overriding the template method itself in a subclass, which breaks the shared order.',
    'Making every step abstract, so subclasses must write parts that could have had a default.',
    'Building deep inheritance chains of templates that are hard to follow.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The template got the header "[" from JsonExport#1. What does it ask for next?',
      view: steps[gotHeader]!.view,
      options: ['JsonExport#1.row({…}), for the first user', 'JsonExport#1.footer()', 'JsonExport#1.separator()', 'JsonExport#1.header() again'],
      answer: 0,
      explanation: 'The template fixes the order: header, then one row per user, then the separator and the footer.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without the pattern, how many classes did skipping users with no email edit?',
      options: ['3', '1', '2', '0'],
      answer: 0,
      explanation: 'Each export class sorted the users itself, so the same filter had to be added in all three.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is the template that fixes the order of the steps?',
      options: [
        'return [this.header(), sorted.map((u) => this.row(u)).join(this.separator()), this.footer()]',
        'return `  ${JSON.stringify({ name: u.name, email: u.email })}`;',
        'const rows = sorted.map((u) => `| ${u.name} | ${u.email} |`);',
        'abstract row(user: User): string;',
      ],
      answer: 0,
      explanation: 'run calls the header, the rows, the separator and the footer in a fixed order. The other lines format one row, or declare a step a subclass must fill in.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why do only some subclasses write separator() and footer()?',
      options: ['They are hooks with a default in Export', 'They are abstract, so the others forgot', 'Only JSON calls them', 'They are private'],
      answer: 0,
      explanation: 'Export gives each hook a default: a new line between rows and no footer. JSON overrides both; the others keep the defaults.',
    },
  ],
  summary: [
    'Template Method writes the steps once, in a base class.',
    'Subclasses fill in the parts that differ, and hooks have defaults.',
    'The template runs on the subclass and calls back into it.',
    'Skipping users with no email edited 3 classes without the pattern and 1 with it.',
  ],
};

export default content;
