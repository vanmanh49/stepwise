import { adapterLesson as lesson } from '../../patterns/adapter/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: lesson.change, amount: '19.99' });
const adapterPaid = steps.findIndex((step) => step.title === 'Checkout#1 calls ProviderAdapter#1.pay(19.99)');

const content: LessonContent = {
  overview:
    'Code you don\'t own, such as a payment provider\'s library, rarely has the exact methods your code expects. The Adapter pattern puts a small class in between that looks like what your code wants and calls what the library offers. This lesson moves a checkout from an old gateway, which takes dollars, to a new provider that wants whole cents and a currency.',
  concept: [
    'The old gateway has pay(amount), in dollars. The new provider has charge(cents, currency). The two do the same job with different names, units and arguments.',
    'In the naive design, Checkout makes its gateway itself and calls it directly. Switching providers means rewriting Checkout: a new field and a new call, with the conversion to cents inside it. Here that is 2 lines, but in a real app every method that pays, refunds or checks a payment changes.',
    'With the pattern, Checkout only knows a gateway with pay(amount), and is handed one when the app starts. A ProviderAdapter has that same pay(amount) method. Inside, it converts to whole cents with Math.round(amount * 100) and calls charge(cents, \'USD\'). Checkout is not edited at all; App changes one line to hand it the adapter.',
    'The rounding matters: 19.99 * 100 is 1998.9999999999998 in floating point, and Math.round makes it 1999. Putting that detail in the adapter keeps it out of your business code.',
    'In real code, adapters wrap third-party SDKs behind your own interface, and libraries such as Axios use one adapter for browsers and another for Node.js behind the same request API.',
  ],
  howItWorks: [
    'Decide on the methods your code wants to call.',
    'Make your code depend on those methods only.',
    'Write an adapter class that has those methods.',
    'Inside, it translates each call into the library\'s own API.',
    'Hand your code the adapter instead of the library.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Your code doesn\'t change when a library does', 'Conversions live in one place', 'Libraries can be swapped or faked in tests'],
    cons: ['One more class to read', 'Adapters can hide slow or failing calls', 'A leaky adapter still exposes the library\'s quirks'],
    useWhen: ['You use a library whose API doesn\'t match your code', 'You may switch providers, or need a fake one in tests'],
    avoidWhen: ['The library already matches what your code needs', 'You only call it once, in one place'],
  },
  applications: [
    'Wrapping payment, email or storage SDKs behind your own interface',
    'HTTP libraries that use different adapters for browsers and servers',
    'Old code made to fit a new interface while it is replaced',
  ],
  commonMistakes: [
    'Letting library types leak through the adapter, so callers depend on the library anyway.',
    'Putting business rules in the adapter. It should only translate.',
    'Forgetting units: dollars and cents, seconds and milliseconds. That is usually the adapter\'s real job.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Checkout has called pay(19.99) on the adapter. What does the adapter call next?',
      view: steps[adapterPaid]!.view,
      options: ['charge(1999, "USD")', 'pay(19.99) on OldGateway', 'charge(19.99, "USD")', 'buy(19.99) on Checkout'],
      answer: 0,
      explanation: 'The adapter converts dollars to whole cents and adds the currency the new provider needs.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Switching providers with the adapter: which class edits were needed?',
      options: ['One line in App, plus the new adapter', 'Checkout and App', 'Only Checkout', 'NewProvider'],
      answer: 0,
      explanation: 'Checkout still calls pay(amount). App hands it the adapter instead of the old gateway.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is the translation the adapter exists for?',
      options: ['return this.provider.charge(Math.round(amount * 100), \'USD\');', 'return this.gateway.pay(amount);', 'checkout = new Checkout(new OldGateway());', 'pay(amount: number): string;'],
      answer: 0,
      explanation: 'It turns the call Checkout makes into the call the new provider understands.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does the adapter use Math.round(amount * 100)?',
      options: ['19.99 * 100 is not exactly 1999', 'Cents must be negative', 'The provider rounds down', 'To add a fee'],
      answer: 0,
      explanation: 'Floating-point maths gives 1998.9999999999998, and rounding gives the whole number of cents.',
    },
  ],
  summary: [
    'An adapter makes a class you can\'t change look like the one your code expects.',
    'It translates names, arguments and units, and nothing else.',
    'Switching providers left Checkout untouched.',
    'Your code depends on your interface, not on the library.',
  ],
};

export default content;
