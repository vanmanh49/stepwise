import { builderLesson as lesson } from '../../patterns/builder/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', page: 'Upload' });
const timeoutSet = steps.findIndex((step) => step.title.startsWith('RequestBuilder#1 returns') && steps[steps.indexOf(step) - 1]!.title.includes('.timeout('));

const content: LessonContent = {
  overview:
    'When an object has many optional settings, its constructor turns into a long row of values, and a call like new Request(url, \'GET\', null, true, 5000) says nothing about what each value means. The Builder pattern sets them one named step at a time. This lesson builds three requests, adds a retries setting, and finds a call site that swapped two numbers.',
  concept: [
    'In the naive design, Request takes five values in a fixed order: url, method, body, json and timeout. To set only the timeout, a page still has to pass every value before it, including nulls and falses. This is called a telescoping constructor.',
    'With the pattern, a RequestBuilder holds the settings, starting from sensible defaults. Each method sets one setting by name and returns the builder, so calls chain: new RequestBuilder(\'/photos\').post(photo).timeout(30000).build(). Only build calls the long constructor, in one place.',
    'Then the app adds retries. In the naive design it becomes a sixth number right after the timeout. The search page wanted a 5000 ms timeout and 2 retries, but wrote 2, 5000. Both are numbers, so it compiles, and the request waits 2 ms and retries 5000 times.',
    'The builder version can\'t make that mistake, because the call says timeout(5000).retries(2). Be honest about the cost, though: it edited 4 classes and 14 lines to the naive design\'s 3 classes and 7 lines. Builder doesn\'t make changes smaller. It makes call sites readable and hard to get wrong.',
    'In real code, Java\'s StringBuilder and HttpRequest.newBuilder(), and query builders such as Knex in JavaScript, build objects one named step at a time.',
  ],
  howItWorks: [
    'Give the builder a field for each setting, with a default.',
    'Add one method per setting that stores it and returns the builder.',
    'Callers chain only the settings they need.',
    'build makes the finished object from the stored settings.',
    'The real constructor is called in one place: inside build.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Each setting is named at the call site', 'Callers set only what they need', 'Hard to pass values in the wrong order'],
    cons: ['A second class to keep in step with the first', 'Adding a setting edits the builder too', 'More code than a constructor for simple objects'],
    useWhen: ['An object has many optional settings', 'Several settings share a type and are easy to swap'],
    avoidWhen: ['The object has two or three required values', 'The language has named arguments that already solve it'],
  },
  applications: [
    'HTTP request builders, such as Java\'s HttpRequest.newBuilder()',
    'SQL query builders that add clauses one call at a time',
    'StringBuilder, which builds a string from many small appends',
  ],
  commonMistakes: [
    'Using a builder for an object with two fields. A constructor is clearer.',
    'Forgetting build at the end, and passing the builder around instead of the object.',
    'Letting a builder be reused after build, so one request\'s settings leak into the next.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The upload page has set POST and the timeout. RequestBuilder#1 has just returned itself. What does the page call next?',
      view: steps[timeoutSet]!.view,
      options: ['build()', 'new Request(...)', 'send()', 'post() again'],
      answer: 0,
      explanation: 'Every setting is in place, so build turns the builder\'s settings into one Request.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why didn\'t TypeScript catch new Request(url, \'GET\', null, true, 2, 5000)?',
      options: ['Timeout and retries are both numbers', 'Request has no types', 'Retries is optional', 'The tracer hid it'],
      answer: 0,
      explanation: 'Two numbers next to each other can be passed in either order, and both orders type-check.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets the next builder call follow on?',
      options: ['return this;', 'this.timeoutMs = ms;', 'private json = false;', 'return new Request(...);'],
      answer: 0,
      explanation: 'Returning the builder itself is what lets calls chain, as in .post(photo).timeout(30000).',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Adding retries: which design edited more classes?',
      options: ['The builder, with 4', 'The naive one, with 4', 'Both edited 1', 'Neither edited any'],
      answer: 0,
      explanation: 'The builder edited Request, RequestBuilder and two pages. Its payoff is safety and readability, not fewer edits.',
    },
  ],
  summary: [
    'A builder sets each setting by name, one step at a time.',
    'build calls the long constructor in one place.',
    'The naive search page swapped two numbers and waited 2 ms.',
    'Builder made the change bigger, but made the mistake impossible.',
  ],
};

export default content;
