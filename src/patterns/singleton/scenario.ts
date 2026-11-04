import { design, type Outcome, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const MODULES = ['3 modules', '2 modules'];

/** The scenario reads each module's private logger to check the result; the design code itself never does. */
type Module = { logger: { lines: string[] } };

function outcome(modules: Module[], shared: boolean): Outcome {
  const loggers = [...new Set(modules.map((m) => m.logger))];
  const lines = loggers.flatMap((l) => l.lines);
  const ok = loggers.length === 1;
  return {
    ok,
    title: ok ? `All ${lines.length} lines are in one log` : `The log is split across ${loggers.length} Logger objects`,
    why: shared
      ? 'Every module asked Logger.getInstance() and got back the same object, so every line lands in one place.'
      : 'Each module made its own Logger with new, so each Logger holds only its own module\'s lines. Reading one log misses the rest.',
    facts: [
      ['Logger objects', String(loggers.length)],
      ['Lines in each log', loggers.map((l) => l.lines.length).join(' + ')],
      ['Debug lines', String(lines.filter((l) => l.startsWith('debug')).length)],
    ],
  };
}

export const singletonLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Turn on debug at runtime',
  scenario: { name: 'modules', label: 'Modules logging', options: MODULES, help: 'How many parts of the app write to the log.' },
  run(choice, modules, t) {
    const three = modules === MODULES[0];
    const m = choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive;
    const billing = new m.BillingModule();
    const cart = new m.CartModule();
    const search = three ? new m.SearchModule() : undefined;
    const list = search ? [billing, cart, search] : [billing, cart];
    for (const module of list) t.register(module);
    if (choice.changed && choice.pattern) {
      const debug = new patternChanged.DebugSwitch();
      t.register(debug);
      debug.turnOn();
    } else if (choice.changed) {
      const debug = new naiveChanged.DebugSwitch();
      t.register(debug);
      debug.turnOn(list as unknown as naiveChanged.BillingModule[]);
    }
    billing.charge();
    cart.add();
    search?.find();
    return outcome(list as unknown as Module[], choice.pattern);
  },
  notes: {
    'Logger.getInstance': 'getInstance makes the Logger only on the first call and keeps it in a static field. Every later call returns that same object.',
    'Logger.log': 'The Logger drops debug lines unless its level is debug, and keeps the rest.',
    'Logger.setLevel': 'This changes the level of this one Logger object only.',
    'DebugSwitch.turnOn': 'The switch turns on debug logging while the app runs.',
    'BillingModule.enableDebug': 'The naive switch can\'t reach the module\'s own Logger, so the module needed a new method for it.',
    'CartModule.enableDebug': 'The naive switch can\'t reach the module\'s own Logger, so the module needed a new method for it.',
    'SearchModule.enableDebug': 'The naive switch can\'t reach the module\'s own Logger, so the module needed a new method for it.',
  },
};
