import { prototypeLesson as lesson } from '../../patterns/prototype/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', copy: 'Shallow' });
const cloned = steps.findIndex((step) => step.title.startsWith('Spawner#1 returns Enemy#2'));

const content: LessonContent = {
  overview:
    'Sometimes the easiest way to make an object is to copy one you already set up. The Prototype pattern lets an object copy itself, so callers don\'t need to know its fields. This lesson spawns a copy of an orc, shows what a shallow copy shares by mistake, and then adds a shield field.',
  concept: [
    'In the naive design, a Spawner copies an enemy by reading each field and passing it to new Enemy(...). It works, but the spawner has to know every field Enemy has.',
    'With the pattern, Enemy has a clone method. It uses Object.assign to copy every field onto a new Enemy, whatever those fields are, and the spawner just calls template.clone(). Copying lives next to the fields it copies.',
    'Adding a shield shows the difference. Both designs edit only Enemy, adding 1 line. The naive copy still loses its shield, because the spawner never heard about it. Nothing failed to compile, and the diff looked just as small. The clone copies the shield without being edited at all.',
    'Watch the Copy setting too. A shallow copy copies the loot reference, not the list, so the copy and the template share one array. When the copy picks up a gem, the template has it too. A deep copy makes a new list, so each enemy owns its own.',
    'In real code, JavaScript\'s structuredClone() makes deep copies, every JavaScript object inherits from a prototype object, and Java has Object.clone() for the same job.',
  ],
  howItWorks: [
    'Give the class a clone method.',
    'clone makes a new object of the same class.',
    'It copies every field, so new fields are copied too.',
    'For a deep copy, it also copies any lists or objects the fields point to.',
    'Callers ask the template to clone itself instead of copying fields by hand.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Callers copy objects without knowing their fields', 'New fields are copied automatically', 'Copying a set-up object is cheaper than setting it up again'],
    cons: ['Shallow copies share nested lists and objects', 'Deep copies of linked objects can be slow or loop', 'Hidden state, such as open files, can\'t be copied'],
    useWhen: ['You make many objects that differ only a little from a template', 'Setting up an object from scratch is slow or complicated'],
    avoidWhen: ['Objects hold connections, files or other things that can\'t be shared', 'A plain constructor with a few values is just as easy'],
  },
  applications: [
    'Games that spawn many copies of a configured enemy or item',
    'Editors that duplicate a shape or a document',
    'structuredClone in JavaScript and Object.clone in Java',
  ],
  commonMistakes: [
    'Making a shallow copy and then changing a list inside it. The original changes too.',
    'Copying fields by name in a helper elsewhere. The helper silently misses the next new field.',
    'Deep-copying objects that point back to each other without guarding against loops.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The spawner just made Enemy#2 as a shallow copy of the orc. The copy picks up a gem. What does the template\'s loot hold then?',
      view: steps[cloned]!.view,
      options: ['axe and gem', 'Only axe', 'Only gem', 'Nothing'],
      answer: 0,
      explanation: 'A shallow copy shares the loot array, so the gem lands in the one list both enemies hold.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'After adding shield, both designs edited 1 line of Enemy. Why is only the naive copy wrong?',
      options: ['Its spawner still copies the old fields', 'Its Enemy has no shield', 'TypeScript removed the shield', 'The template had no shield'],
      answer: 0,
      explanation: 'The naive spawner names each field it copies, and nobody told it about shield. clone copies whatever fields exist.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line gives the deep copy its own loot list?',
      options: ['if (deep) copy.loot = [...this.loot];', 'this.loot.push(item);', 'return template.clone(deep);', 'public loot: string[],'],
      answer: 0,
      explanation: 'The spread makes a new array with the same items, so the copy no longer shares the template\'s list.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does a shallow copy copy for a field that holds an array?',
      options: ['The reference to the array', 'Every item, one by one', 'Nothing at all', 'Only the first item'],
      answer: 0,
      explanation: 'The copy gets the same reference, so both objects point at one array.',
    },
  ],
  summary: [
    'A prototype copies itself, so callers don\'t need to know its fields.',
    'Copying by field name misses new fields, without any warning.',
    'Shallow copies share nested lists; deep copies make their own.',
    'In JavaScript, structuredClone makes deep copies.',
  ],
};

export default content;
