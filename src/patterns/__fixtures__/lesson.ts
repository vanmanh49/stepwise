import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

/** A tiny lesson for testing the step builder: Boom throws and Loop never ends. */
export const fixtureLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add paging',
  scenario: { name: 'to', label: 'Send to', options: ['Ann', 'Bob', 'Cy', 'Boom', 'Loop'], afterChangeOnly: ['Cy'], patternOnly: ['Bob'] },
  run({ pattern: usePattern, changed }, to, t) {
    if (to === 'Boom') throw new Error('boom');
    const shop = usePattern
      ? new (changed ? patternChanged : pattern).Shop(new (changed ? patternChanged : pattern).Sender())
      : new (changed ? naiveChanged : naive).Shop();
    t.register(shop);
    const times = to === 'Loop' ? 300 : 1;
    let text = '';
    for (let i = 0; i < times; i++) text = shop.order(to);
    return { ok: text.startsWith('mail') || text.startsWith('page'), title: `Sent: ${text}`, why: 'The shop sent one message.', facts: [['Message', text]] };
  },
  notes: { 'Shop.order': 'The client places an order.' },
};
