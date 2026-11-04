import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const LOOKUPS = ['Same city 3 times', '3 different cities'];
const CITIES: Record<string, string[]> = {
  'Same city 3 times': ['Hanoi', 'Hanoi', 'Hanoi'],
  '3 different cities': ['Hanoi', 'Paris', 'Lima'],
};
/** A pretend round trip to the weather service, so the waiting can be counted. */
const CALL_MS = 800;
const WIDGETS = [
  ['Today', 'TodayWidget'],
  ['Week', 'WeekWidget'],
  ['Map', 'MapWidget'],
] as const;

type Widget = { show(city: string): string };
type WidgetClass = new (weather: { forecast(city: string): string }, log: string[]) => Widget;

export const proxyPatternLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Log every request',
  scenario: {
    name: 'lookups',
    label: 'Lookups',
    options: LOOKUPS,
    help: 'Which cities the three widgets ask about.',
  },
  run(choice, lookups, t) {
    const m = (choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive) as unknown as typeof patternChanged;
    const api = new m.WeatherApi();
    const proxy = choice.pattern ? new m.CachedWeather(api) : undefined;
    // The naive widgets each write to a log they are given; the proxy keeps its own.
    const log: string[] = proxy?.log ?? [];
    const shown: [string, string][] = WIDGETS.map(([label, name], i) => {
      const widget = new (m[name] as unknown as WidgetClass)(proxy ?? api, log);
      t.register(widget);
      return [label, widget.show(CITIES[lookups]![i]!)];
    });
    const facts: [string, string][] = [
      ...shown,
      ['Real API calls', String(api.calls)],
      ['Time waiting', `${api.calls * CALL_MS} ms`],
    ];
    if (choice.changed) facts.push(['Log lines', String(log.length)]);
    return {
      ok: true,
      title: `${api.calls} real ${api.calls === 1 ? 'call' : 'calls'} for 3 lookups`,
      why: choice.pattern
        ? api.calls < 3
          ? `The proxy asked the API once per city and answered the rest from its cache, so the widgets waited ${api.calls * CALL_MS} ms instead of ${3 * CALL_MS} ms.`
          : 'Every city was new, so the proxy had to ask the API each time. A cache only helps when lookups repeat.'
        : `Every widget went straight to the API, so the page waited ${api.calls * CALL_MS} ms, ${CALL_MS} ms per call.`,
      facts,
    };
  },
  notes: {
    'TodayWidget.show': 'The widget needs a forecast. It asks whatever weather source it was given.',
    'WeekWidget.show': 'This widget asks its weather source too, not knowing whether anyone asked before.',
    'MapWidget.show': 'The third widget asks its weather source as well.',
    'CachedWeather.forecast': 'The proxy has the same forecast method as the API. It checks its cache first and only calls the API on a miss.',
    'WeatherApi.forecast': 'The real API is slow: each call is a round trip over the network.',
  },
};
