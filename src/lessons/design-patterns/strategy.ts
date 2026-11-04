import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import { strategyLesson as lesson } from '../../patterns/strategy/scenario';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', rule: 'Member' });
const afterSwap = steps.findLastIndex((step) => step.title === 'client calls Cart#1.total()');

const content: LessonContent = {
  overview:
    'Many programs do one job in several interchangeable ways: pricing, sorting, routing, compressing. The Strategy pattern puts each way in its own small class behind one method, and lets the code that uses it swap one for another at run time. This lesson prices a cart of 10 items under different discount rules, then adds a bulk discount.',
  concept: [
    'In the naive design, Cart stores the rule as a name such as "member" and its total method holds an if chain with a branch for each rule. Every rule lives inside the cart, so the cart has to change whenever pricing does.',
    'With the pattern, each rule is a class with one method, apply(prices): RegularPrice, MemberPrice and SalePrice. The cart holds a rule object and its total method is one line, this.rule.apply(this.prices). The run prices the cart as regular ($191.49), then the shopper switches rule with setRule and the same cart is priced again. As a member it comes to $172.34.',
    'Adding a bulk discount is honestly smaller without the pattern: 1 line in the cart\'s if chain, against a 6-line BulkPrice class. What the pattern buys is that Cart is not edited at all. The new rule, and its one if, live in a class you can test on its own, and Cart has no chain to grow when the next rule, or the one after, arrives.',
    'Strategy looks like Factory Method, since both pick behaviour by class. Factory Method is about which object gets created. Strategy is about which algorithm an object uses, and that choice can change while the program runs.',
    'In real code, Array.prototype.sort takes a comparator function, which is a strategy for ordering. Passport.js has one strategy per login method, and compression libraries let you pass in the algorithm to use.',
  ],
  howItWorks: [
    'Find the part that varies, such as how a total is worked out.',
    'Give every variant one shared method, such as apply(prices).',
    'Put each variant in its own class.',
    'Let the user, such as Cart, hold one variant and call that method.',
    'Swap the variant at run time with a setter, or add a new one as a new class.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['The code using the algorithm never changes when one is added', 'Each algorithm is small and testable alone', 'The algorithm can be swapped while the program runs'],
    cons: ['One class per variant, even tiny ones', 'Callers must know which strategy to pick', 'A new variant can be more lines than one more if'],
    useWhen: ['There are several ways to do one job and more are coming', 'The choice changes at run time, such as after a login'],
    avoidWhen: ['There are two fixed branches that will never grow, so one if is clearer', 'The variants need very different inputs, so one shared method doesn\'t fit'],
  },
  applications: [
    'Comparators passed to sort functions',
    'Login strategies in Passport.js and similar auth libraries',
    'Pricing, tax and shipping rules in shops',
  ],
  commonMistakes: [
    'Making a strategy for a choice that never changes, which adds classes for nothing.',
    'Letting a strategy reach back into the cart\'s internals, so they are joined again.',
    'Rounding money in each step instead of once, so totals drift by a cent.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The cart has just switched to MemberPrice and the client asks for the total again. What does Cart#1 call?',
      view: steps[afterSwap]!.view,
      options: ['MemberPrice#1.apply([10 items])', 'RegularPrice#1.apply([10 items])', 'Cart#1.setRule()', 'Nothing, it remembers the old total'],
      answer: 0,
      explanation: 'The cart always asks whichever rule it holds now, and setRule just gave it MemberPrice#1.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With the pattern, how many lines of Cart did the bulk discount change?',
      options: ['0', '1', '6', '3'],
      answer: 0,
      explanation: 'The new rule is its own 6-line class. Cart already calls rule.apply, so it needs no edit.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets the cart work with any pricing rule?',
      options: ['return this.rule.apply(this.prices);', 'if (this.rule === \'member\') return Math.round((sum * 90) / 100);', 'rule = \'regular\';', 'const sum = this.prices.reduce((a, b) => a + b, 0);'],
      answer: 0,
      explanation: 'The cart hands its prices to the rule object and never looks at which rule it is.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'The naive change was 1 line and the pattern\'s was 6. Why use the pattern anyway?',
      options: ['Cart stays untouched and each rule can be tested alone', 'Each rule runs faster than an if chain does', 'The rules share one object, which saves memory', 'Rule classes need no tests of their own'],
      answer: 0,
      explanation: 'The pattern trades a few more lines for code that does not have to change, and rules that stand on their own.',
    },
  ],
  summary: [
    'Strategy puts each way of doing a job in its own class behind one method.',
    'The user holds one strategy and can swap it at run time.',
    'Bulk pricing edited Cart without the pattern, and nothing with it.',
    'For two fixed branches, a plain if is often the better choice.',
  ],
};

export default content;
