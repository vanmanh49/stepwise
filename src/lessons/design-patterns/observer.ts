import { observerLesson as lesson } from '../../patterns/observer/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', phone: 'Leaves after the first reading' });
const secondReading = steps.findIndex((step) => step.title === 'client calls Station#1.setReading(31)');

const content: LessonContent = {
  overview:
    'When one thing changes, other parts of a program often need to hear about it. The Observer pattern lets those parts subscribe to the thing that changes, so it can tell them without knowing who they are. This lesson sends two temperature readings, 28° and 31°, to a phone and a web display, lets the phone leave, then adds a heat alert.',
  concept: [
    'In the naive design, Station holds a PhoneDisplay and a WebDisplay in fields and calls each by name in setReading. It works while the list of displays never changes. When the phone app closes after the first reading, the station has no way to stop calling it, so the phone is still sent 31°. That is the wrong result the run shows.',
    'With the pattern, Station keeps a list of observers. Each display calls subscribe to join and unsubscribe to leave, and setReading calls update(temp) on whoever is on the list at that moment. The station never names a display. After the phone unsubscribes, the second reading goes only to the web display.',
    'Adding a heat alert shows the cost. The naive station has to be edited: a new field, a new constructor argument and a new call, 8 lines across HeatAlert and Station. With the pattern, HeatAlert is one more subscriber in 6 lines and Station is untouched. In both designs the alert fires once, for 31°.',
    'The pattern has a cost of its own. Because the station doesn\'t know who is listening, it is harder to see what one reading will set off. A subscriber that forgets to unsubscribe keeps receiving updates and keeps its memory alive, which is a common leak.',
    'In real code, addEventListener and removeEventListener are the Observer pattern: a button doesn\'t know who handles its click. Node.js EventEmitter, RxJS observables and the change notifications in UI frameworks work the same way.',
  ],
  howItWorks: [
    'Give the thing that changes, the subject, a list of observers.',
    'Let observers join and leave with subscribe and unsubscribe.',
    'Agree on one method every observer has, such as update(temp).',
    'When the subject changes, call that method on everyone on the list.',
    'A new kind of listener is one new class that subscribes; the subject doesn\'t change.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['The subject doesn\'t know or name its listeners', 'Listeners can join and leave while the program runs', 'A new listener needs no change to the subject'],
    cons: ['Hard to see everything one change sets off', 'Forgotten subscriptions keep receiving updates and leak memory', 'The order listeners are told in is easy to depend on by accident'],
    useWhen: ['Several parts react to one change, and the list of them changes', 'The subject should not depend on the code that reacts to it'],
    avoidWhen: ['There is one fixed listener, so a direct call is clearer', 'Updates trigger more updates in long chains that are hard to follow'],
  },
  applications: [
    'DOM events with addEventListener',
    'Node.js EventEmitter and message buses',
    'State stores in UI frameworks that re-render subscribed components',
  ],
  commonMistakes: [
    'Never unsubscribing, so closed screens keep getting updates and can\'t be freed.',
    'Changing the subject inside an update, which starts another round of updates.',
    'Relying on the order observers are told in, which the subject doesn\'t promise.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The phone has unsubscribed, and now the 31° reading arrives. Who does Station#1 call?',
      view: steps[secondReading]!.view,
      options: ['WebDisplay#1.update(31) only', 'PhoneDisplay#1.update(31), then WebDisplay#1.update(31)', 'PhoneDisplay#1.update(31) only', 'Nobody, the list is empty'],
      answer: 0,
      explanation: 'The phone left the list, so the station tells only the web display, which is still subscribed.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without the pattern, what did the phone show after it left?',
      options: ['28°, 31°', '28°', '31°', 'Nothing'],
      answer: 0,
      explanation: 'The naive station calls the phone by name every time, so the closed app still got 31°.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets the station tell displays it has never heard of?',
      options: ['for (const observer of this.observers) observer.update(temp);', 'this.observers = this.observers.filter((o) => o !== observer);', 'this.phone.show(temp);', 'public web: WebDisplay,'],
      answer: 0,
      explanation: 'The station loops over whoever subscribed and calls the one method they all share. The filter line only removes a subscriber.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With the pattern, which existing class did the heat alert edit?',
      options: ['None', 'Station', 'PhoneDisplay', 'WebDisplay'],
      answer: 0,
      explanation: 'HeatAlert is a new subscriber. The station already tells everyone on its list, so it needs no change.',
    },
  ],
  summary: [
    'Observer lets parts of a program subscribe to a change.',
    'The subject tells whoever is subscribed, without naming them.',
    'A phone that left kept getting readings without the pattern.',
    'The heat alert edited the station without the pattern, and nothing with it.',
  ],
};

export default content;
