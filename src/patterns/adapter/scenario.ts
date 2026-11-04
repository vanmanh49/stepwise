import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const AMOUNTS = ['19.99', '0.10', '5'];

type Module = { App: new () => { checkout: { buy(amount: number): string } } };

export const adapterLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Switch to the new provider',
  scenario: { name: 'amount', label: 'Amount ($)', options: AMOUNTS, help: 'What the customer pays. The new provider wants whole cents.' },
  run(choice, amount, t) {
    const m: Module = choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive;
    const app = new m.App();
    t.register(app);
    const paid = app.checkout.buy(Number(amount));
    return {
      ok: true,
      title: choice.changed ? `The new provider charged ${paid.split(' ')[1]} cents` : `The old gateway took $${Number(amount).toFixed(2)}`,
      why: choice.pattern
        ? choice.changed
          ? 'Checkout still calls pay(amount). The adapter turns that into the new provider\'s charge(cents, currency), so Checkout never learned the new API.'
          : 'Checkout calls pay(amount) on whatever gateway it was given.'
        : choice.changed
          ? 'Checkout itself was rewritten to speak the new provider\'s API, in cents.'
          : 'Checkout makes its own gateway and calls it directly.',
      facts: [
        ['Payment', paid],
        ['Checkout sees', choice.pattern ? 'pay(amount), as before' : choice.changed ? 'charge(cents, currency), new' : 'pay(amount)'],
      ],
    };
  },
  notes: {
    'Checkout.buy': 'The customer pays. Checkout passes the amount on to its gateway.',
    'ProviderAdapter.pay': 'The adapter looks like the old gateway from outside: it has pay(amount), which is all Checkout knows.',
    'NewProvider.charge': 'The adapter turned dollars into whole cents and added the currency the new API wants.',
    'OldGateway.pay': 'The old gateway takes dollars.',
  },
};
