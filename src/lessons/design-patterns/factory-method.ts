import { factoryMethodLesson as lesson } from '../../patterns/factory-method/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const presets = patternPresets(lesson);
const steps = patternSteps(lesson, presets[1]!.values);
const notifying = steps.findIndex((step) => step.title.startsWith('SignupFlow#1 calls EmailNotifier#1.notify('));

const content: LessonContent = {
  overview:
    'Code that makes objects with new is tied to the exact classes it names. The Factory Method pattern moves that choice into one overridable method, so subclasses decide what to make. This lesson sends three kinds of message by email or SMS, then adds a third channel, Push, and counts what changes.',
  concept: [
    'In the naive design, each of the three flows (signup, password reset and receipt) checks the channel itself: if it is email, make an EmailMessage, otherwise an SmsMessage. The same if appears in three places.',
    'With the pattern, a Notifier base class has one method, notify, that asks this.createMessage() for a message and sends it. createMessage is the factory method. EmailNotifier overrides it to make an EmailMessage and SmsNotifier to make an SmsMessage. The flows only know they have a Notifier.',
    'The change request is to add Push. The naive design adds a PushMessage class and edits all 3 flows, adding a branch to each: 11 lines added and 3 removed. The pattern adds PushMessage and PushNotifier, 10 new lines, and edits no existing class at all.',
    'Something still has to choose EmailNotifier or SmsNotifier once, usually where the app starts. The pattern doesn\'t remove that decision. It puts it in one place, instead of in every flow.',
    'In real code, document.createElement in the browser and Java\'s Collection.iterator() are factory methods: each kind of document or collection decides which concrete object you get back.',
  ],
  howItWorks: [
    'Write the shared work once, in a base class.',
    'Where it needs a new object, call an overridable method instead of new.',
    'Each subclass overrides that method to make its own kind of object.',
    'Callers hold the base type and never name the concrete class.',
    'A new kind means a new subclass, not edits to the callers.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets,
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Callers don\'t depend on concrete classes', 'A new kind is a new subclass, with no edits elsewhere', 'The choice of class lives in one place'],
    cons: ['Each new kind needs a new subclass', 'More classes to read than a simple if', 'The base class decides when objects get made'],
    useWhen: ['Several callers make objects whose class varies', 'You expect new kinds to be added over time'],
    avoidWhen: ['There is only one kind, and no sign of a second', 'A plain function that takes the class would do'],
  },
  applications: [
    'Notification and export systems with one class per channel or format',
    'Frameworks that let your subclass decide which object to create',
    'document.createElement and the iterator() method of Java collections',
  ],
  commonMistakes: [
    'Adding a factory method when there will only ever be one kind. It is a class with no job.',
    'Putting the if back inside the factory method. Then the base class still knows every kind.',
    'Calling the concrete constructor somewhere else anyway, which brings the coupling back.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'SignupFlow has just asked EmailNotifier#1 to notify. What does notify call next?',
      view: steps[notifying]!.view,
      options: ['Its own createMessage()', 'new EmailMessage() directly', 'SignupFlow again', 'SmsNotifier'],
      answer: 0,
      explanation: 'notify is written once in the base class and asks this.createMessage() for the message, which EmailNotifier overrides.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Adding Push with the pattern: how many existing classes did you have to edit?',
      options: ['0', '1', '2', '3'],
      answer: 0,
      explanation: 'Push needed two new classes, PushMessage and PushNotifier. Nothing that already existed changed.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is the factory method being used?',
      options: ['const message = this.createMessage();', 'return message.send(to, text);', 'constructor(private notifier: Notifier) {}', 'return this.notifier.notify(user, text);'],
      answer: 0,
      explanation: 'notify gets its message from an overridable method instead of naming a class with new.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With the pattern, where does the app decide between email and SMS?',
      options: ['Once, where it picks the notifier', 'Inside every flow', 'Inside notify', 'Inside each message class'],
      answer: 0,
      explanation: 'The app makes EmailNotifier or SmsNotifier once and hands it to the flows, which never ask again.',
    },
  ],
  summary: [
    'A factory method lets a subclass decide which object gets made.',
    'Shared code calls this.createMessage() instead of new.',
    'Adding Push edited 3 flows without the pattern, and none with it.',
    'Something still picks the subclass once, at startup.',
  ],
};

export default content;
