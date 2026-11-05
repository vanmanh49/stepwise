import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const THEN = ['Win the fight', 'Lose and load the save', 'Lose twice, loading the same save each time'];

export const mementoLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add an inventory',
  scenario: {
    name: 'outcome',
    label: 'Then',
    options: THEN,
    help: 'The game saves the hero before a boss fight. Then the hero wins, or loses and the save is loaded.',
  },
  run(choice, then, t) {
    const hero = new (choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive).Hero();
    t.register(hero);
    let load: () => void;
    if (choice.pattern) {
      const slots = new (choice.changed ? patternChanged : pattern).SaveSlots();
      t.register(slots);
      slots.keep((hero as pattern.Hero).save());
      load = () => (hero as pattern.Hero).restore(slots.latest());
    } else {
      const slot = new (choice.changed ? naiveChanged : naive).SaveSlot();
      t.register(slot);
      slot.save(hero as naiveChanged.Hero);
      load = () => slot.load(hero as naiveChanged.Hero);
    }
    const saved = hero.status();
    if (then === THEN[0]) {
      hero.fight(true);
      return {
        ok: true,
        title: 'The hero won, so the save is not needed',
        why: 'Winning keeps the gold, and the save stays as it was in case it is needed later.',
        facts: [
          ['Saved', saved],
          ['Now', hero.status()],
        ],
      };
    }
    hero.fight(false);
    const lost = hero.status();
    load();
    const loaded = hero.status();
    const facts: [string, string][] = [
      ['Saved', saved],
      ['After the fight', lost],
      ['After loading', loaded],
    ];
    let again = loaded;
    if (then === THEN[2]) {
      hero.fight(false);
      load();
      again = hero.status();
      facts.push(['After loading again', again]);
    }
    const ok = loaded === saved && again === saved;
    return {
      ok,
      title: ok ? 'Loading the save put the hero back exactly as saved' : 'Loading the save did not give back the saved hero',
      why: choice.pattern
        ? 'The hero made the snapshot itself and read it back itself. Nobody else knows what is inside a HeroMemento.'
        : 'SaveSlot copied each field out of the hero and wrote each one back, so it has to know every field the hero has.',
      facts,
    };
  },
  notes: {
    'SaveSlot.save': 'The save slot reaches into the hero and copies each field it knows about.',
    'SaveSlot.load': 'The save slot writes each saved field back into the hero.',
    'Hero.save': 'The hero makes a snapshot of itself, a HeroMemento, that nobody else can read.',
    'Hero.restore': 'The hero reads its own snapshot back and copies it, so it never shares data with the save.',
    'SaveSlots.keep': 'The save slots keep the memento without looking inside it.',
    'SaveSlots.latest': 'The game asks for the most recent save.',
    'Hero.fight': 'The boss fight changes the hero\'s position, gold and health.',
    'Hero.status': 'The game reads how the hero is doing.',
  },
};
