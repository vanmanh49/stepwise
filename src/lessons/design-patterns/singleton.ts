import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import { singletonLesson as lesson } from '../../patterns/singleton/scenario';
import type { LessonContent } from '../../types/lesson';

const presets = patternPresets(lesson);
const steps = patternSteps(lesson, presets[1]!.values);
const secondAsk = steps.filter((step) => step.title === 'client calls Logger.getInstance()')[1]!;

const content: LessonContent = {
  overview:
    'Some things should exist only once in a program, such as the log, the settings or a connection pool. The Singleton pattern makes a class hand out one shared object instead of a new one each time. This lesson gives three parts of an app a Logger, the naive way and the Singleton way, then turns on debug logging while the app runs.',
  concept: [
    'In the naive design, each module writes new Logger(). Every new makes a separate object, so each module ends up with its own log. Each one holds a single line, and someone reading one log misses the other two.',
    'A Singleton moves the decision into the class. The constructor is no longer how you get a Logger. Instead you call Logger.getInstance(), which makes the object on the first call, keeps it in a static field, and returns that same object on every later call.',
    'The change request shows the second benefit. To turn on debug at runtime, the naive app has to reach every module\'s private Logger, so each module needs a new enableDebug method: 3 classes edited and 14 lines added. With the Singleton, a new DebugSwitch calls Logger.getInstance().setLevel(\'debug\'), adding 5 lines and editing nothing.',
    'The cost is that a Singleton is global state in disguise. Any code can reach it, so a test can\'t easily swap it for a fake, and two tests that run one after the other share the same object. Many teams prefer to make one Logger at startup and pass it to whoever needs it, which is called dependency injection.',
    'In real code, java.lang.Runtime.getRuntime() returns the one Runtime of a Java program, and a JavaScript module is a singleton by itself: every import of a module gets the same exported object.',
  ],
  howItWorks: [
    'Make the instance field static, so it belongs to the class, not to any object.',
    'Give the class a static getInstance method.',
    'On the first call, getInstance makes the object and stores it.',
    'Every later call returns the stored object.',
    'Callers use getInstance instead of new.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets,
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Everyone shares one object, so its state is in one place', 'The object is made only when first needed', 'Code anywhere can reach it without passing it around'],
    cons: ['It is global state, so any code can change it', 'Tests can\'t easily replace it with a fake', 'It hides which classes depend on it'],
    useWhen: ['There must be exactly one of something, such as a log or a settings store', 'The one object is expensive to make and should be made only once'],
    avoidWhen: ['You only want to save passing an argument around', 'Tests need a fresh or fake copy for each case'],
  },
  applications: [
    'Loggers and settings stores shared by a whole app',
    'Connection pools and caches that must not be duplicated',
    'The single Runtime object in Java and the one window object in a browser',
  ],
  commonMistakes: [
    'Using a Singleton as a box of global variables. Every class that reads it is now tied to it.',
    'Forgetting that state lasts between tests. One test\'s changes leak into the next unless something resets them.',
    'Calling new on the class anyway. A Singleton only works if every caller goes through getInstance.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'BillingModule was made first and got Logger#1 from Logger.getInstance(). Now CartModule is being made, and its logger field asks again. What comes back?',
      view: secondAsk.view,
      options: ['Logger#1, the same object', 'A new Logger#2', 'Nothing, the call fails', 'A copy of Logger#1'],
      answer: 0,
      explanation: 'The first call stored Logger#1 in the static field, so every later call returns that same object.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'In the naive design, three modules each write new Logger(). How many logs does the app end up with?',
      options: ['3', '1', '0', 'It depends on the level'],
      answer: 0,
      explanation: 'Each new makes a separate object, so each module writes to its own log.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes getInstance return the same object every time?',
      options: ['Logger.instance ??= new Logger();', 'this.level = level;', 'lines: string[] = [];', 'this.lines.push(text);'],
      answer: 0,
      explanation: '??= makes a Logger only while the static field is empty. After that it keeps the one already stored.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why do many teams avoid Singletons in code they test a lot?',
      options: ['Tests can\'t easily swap in a fake', 'They are slow to call', 'They use more memory', 'They can\'t hold state'],
      answer: 0,
      explanation: 'Code reaches the Singleton directly, so a test has no place to hand it a fake. Passing the object in fixes that.',
    },
  ],
  summary: [
    'A Singleton makes a class hand out one shared object.',
    'getInstance makes it on the first call and returns it after that.',
    'Turning on debug took 5 new lines with the Singleton, and edits to 3 classes without it.',
    'It is global state, so it makes testing harder.',
  ],
};

export default content;
