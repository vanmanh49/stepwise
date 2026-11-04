import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const THEMES = ['Light', 'Dark', 'High contrast'];
const WORD: Record<string, string> = { Light: 'light', Dark: 'dark', 'High contrast': 'high-contrast' };

type Screen = { render(): string[] };

export const abstractFactoryLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add High contrast',
  scenario: { name: 'theme', label: 'Theme', options: THEMES, help: 'The look the user picked. High contrast exists only after the change.', afterChangeOnly: ['High contrast'] },
  run(choice, theme, t) {
    const word = WORD[theme]!;
    let screens: [Screen, Screen];
    if (choice.pattern) {
      // The unchanged module has no Contrast classes, and High contrast is refused before the change.
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      const factory = theme === 'Light' ? new m.LightFactory() : theme === 'Dark' ? new m.DarkFactory() : new m.ContrastFactory();
      t.register(factory);
      screens = [new m.SettingsScreen(factory), new m.AboutScreen(factory)];
    } else {
      const m = choice.changed ? naiveChanged : naive;
      screens = [new m.SettingsScreen(word), new m.AboutScreen(word)];
    }
    for (const screen of screens) t.register(screen);
    const drawn = screens.map((s) => s.render());
    const mixed = ['Settings', 'About'].filter((_, i) => drawn[i]!.some((w) => !w.startsWith(`${word} `)));
    return {
      ok: mixed.length === 0,
      title: mixed.length === 0 ? `Both screens are fully ${word}` : `The ${mixed.join(' and ')} screen mixes two themes`,
      why:
        mixed.length === 0
          ? choice.pattern
            ? `Each screen got all its widgets from the one ${theme} factory, so they can only match.`
            : 'Every widget happens to match here.'
          : 'The About screen checks the theme for its button but always makes a light dialog. With the check copied into every screen, one copy drifted.',
      facts: [
        ['Settings', drawn[0]!.join(' + ')],
        ['About', drawn[1]!.join(' + ')],
      ],
    };
  },
  notes: {
    'SettingsScreen.render': 'The settings screen draws a button and a dialog.',
    'AboutScreen.render': 'The about screen draws a button and a dialog too.',
    'LightFactory.createButton': 'The factory makes a button in its own theme. The screen never names the class.',
    'DarkFactory.createButton': 'The factory makes a button in its own theme. The screen never names the class.',
    'ContrastFactory.createButton': 'The factory makes a button in its own theme. The screen never names the class.',
    'LightFactory.createDialog': 'The same factory makes the dialog, so it matches the button.',
    'DarkFactory.createDialog': 'The same factory makes the dialog, so it matches the button.',
    'ContrastFactory.createDialog': 'The same factory makes the dialog, so it matches the button.',
  },
};
