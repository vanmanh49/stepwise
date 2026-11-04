import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

/** Ten items, in cents, so every total is a whole number. */
export const PRICES = [1500, 2500, 800, 3200, 1200, 999, 4500, 650, 2000, 1800];
export const RULES = ['Regular', 'Member', 'Sale', 'Bulk (10+ items)'];
/** Each rule's name in the naive cart, and its class in the pattern. */
const RULE: Record<string, [string, keyof typeof patternChanged]> = {
  Regular: ['regular', 'RegularPrice'],
  Member: ['member', 'MemberPrice'],
  Sale: ['sale', 'SalePrice'],
  'Bulk (10+ items)': ['bulk', 'BulkPrice'],
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Priced = { total(): number };

export const strategyLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a bulk discount',
  scenario: {
    name: 'rule',
    label: 'Rule',
    options: RULES,
    help: 'The pricing rule the shopper switches to at checkout. Bulk exists only after the change.',
    afterChangeOnly: ['Bulk (10+ items)'],
  },
  run(choice, rule, t) {
    const [name, className] = RULE[rule]!;
    let cart: Priced;
    let swap: () => void;
    if (choice.pattern) {
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      const Rule = m[className] as new () => pattern.RegularPrice;
      const priced = new m.Cart(PRICES, new m.RegularPrice());
      swap = () => priced.setRule(new Rule());
      cart = priced;
    } else {
      const priced = new (choice.changed ? naiveChanged : naive).Cart(PRICES);
      swap = () => priced.setRule(name);
      cart = priced;
    }
    t.register(cart);
    const before = cart.total();
    swap();
    const after = cart.total();
    return {
      ok: true,
      title: `${rule} pricing makes the cart ${money(after)}`,
      why: choice.pattern
        ? `The cart handed its prices to whichever rule it held. Swapping the rule object changed the total without touching the cart.`
        : `The cart's total method checked the rule's name in an if chain, and took the branch for "${name}".`,
      facts: [
        ['Regular price', money(before)],
        [`${rule} price`, money(after)],
        ['You save', money(before - after)],
      ],
    };
  },
  notes: {
    'Cart.total': 'The cart needs its total.',
    'Cart.setRule': 'The shopper changes how they pay, such as logging in as a member, so the cart switches rule halfway through checkout.',
    'RegularPrice.apply': 'The regular rule adds up the prices with no discount.',
    'MemberPrice.apply': 'The member rule takes 10% off the whole cart.',
    'SalePrice.apply': 'The sale rule takes 20% off items that cost $20 or more.',
    'BulkPrice.apply': 'The new bulk rule takes 15% off when the cart has 10 or more items.',
  },
};
