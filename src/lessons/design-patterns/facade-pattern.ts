import { facadeLesson as lesson } from '../../patterns/facade-pattern/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', clients: '2 clients' });
const reserved = steps.findIndex((step) => step.title === 'Inventory#1 returns "reserved book"');

const content: LessonContent = {
  overview:
    'Placing an order touches several parts of a system: inventory, payment and shipping, each with its own methods and its own rules about order. The Facade pattern gives them one simple front door. This lesson places orders from up to three clients, then renames the payment API and counts which classes have to change.',
  concept: [
    'In the naive design, the web shop, the mobile app and phone orders each call all three subsystems themselves: reserve the item, charge the card, book the delivery. Each client knows every subsystem and the right order to call them in.',
    'With the pattern, an OrderFacade has one method, place, which makes the same three calls in the same order. Clients only call place. The sequence shows the same calls as before, all coming from the facade.',
    'Then the payment team renames charge(amount) to capture(amount, currency). Without the facade, Payment and all 3 clients change: 4 classes and 5 lines. With it, only Payment and the facade change: 2 classes and 3 lines. The clients never knew Payment existed.',
    'A facade doesn\'t hide the subsystems. Code that needs something special can still call them directly. Watch for a facade that keeps growing until it does everything, though. That is a sign it should be split.',
    'In real code, jQuery\'s $.ajax was a facade over the browser\'s XMLHttpRequest, and a service layer in a web app is usually a facade over its repositories, payment provider and email sender.',
  ],
  howItWorks: [
    'Find the calls that clients make to several subsystems together.',
    'Write one facade class that holds those subsystems.',
    'Give it one method per task, making the calls in the right order.',
    'Clients call the facade instead of the subsystems.',
    'Subsystem changes now stop at the facade.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Clients use one simple call', 'Changes to subsystems stop at the facade', 'The order of steps is written once'],
    cons: ['The facade can grow into a class that does everything', 'Hides details some clients may need', 'One more layer to read'],
    useWhen: ['Many clients repeat the same sequence of calls', 'You want to shield clients from a complicated or changing subsystem'],
    avoidWhen: ['There is one client and one call', 'Clients need fine control over each subsystem'],
  },
  applications: [
    'Service layers that wrap repositories, payments and email',
    'SDKs that offer one call over many internal APIs',
    'jQuery\'s $.ajax over the browser\'s XMLHttpRequest',
  ],
  commonMistakes: [
    'Letting the facade grow into a god object that owns every task in the app.',
    'Putting business decisions in the facade instead of in the subsystems.',
    'Forcing every client through the facade, even ones that need direct access.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The facade has just reserved the book for the web shop. What does OrderFacade#1 call next?',
      view: steps[reserved]!.view,
      options: ['Payment#1.charge(20)', 'Shipping#1.book first', 'WebShop#1.order', 'MobileApp#1.order'],
      answer: 0,
      explanation: 'The facade knows the order: reserve, then charge, then book the delivery.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'After renaming the payment API, which classes changed with the facade?',
      options: ['Payment and OrderFacade', 'Payment and all 3 clients', 'Only the clients', 'Every class'],
      answer: 0,
      explanation: 'The clients only know the facade, so the rename stops there.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is all a client needs to place an order?',
      options: ['return this.orders.place(sku, amount, address);', 'this.payment.charge(amount)', 'this.inventory.reserve(sku)', 'this.shipping.book(address)'],
      answer: 0,
      explanation: 'One call to the facade replaces the three subsystem calls.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What is the warning sign of a facade that has gone wrong?',
      options: ['It keeps growing to do everything', 'It has one method', 'Clients call it', 'It holds three subsystems'],
      answer: 0,
      explanation: 'A facade should simplify a few tasks. One that owns every task has become a god object.',
    },
  ],
  summary: [
    'A facade gives several subsystems one simple front door.',
    'It makes the calls, in the right order, for its clients.',
    'Renaming the payment API edited 4 classes without it, and 2 with it.',
    'Keep it small: a facade that does everything is a new problem.',
  ],
};

export default content;
