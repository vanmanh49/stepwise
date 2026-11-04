import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const PHONE = ['Stays subscribed', 'Leaves after the first reading'];
const READINGS = [28, 31];

const degrees = (temps: number[]) => temps.map((t) => `${t}°`).join(', ') || 'nothing';

export const observerLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a heat alert over 30°',
  scenario: {
    name: 'phone',
    label: 'Phone',
    options: PHONE,
    help: 'Whether the phone display stops listening after the first reading, such as when its app closes.',
  },
  run(choice, phone, t) {
    const leaves = phone === PHONE[1];
    let shown: { phone: number[]; web: number[]; alerts?: number[] };
    if (choice.pattern) {
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      const station = new m.Station();
      const display = new m.PhoneDisplay();
      const web = new m.WebDisplay();
      const alert = choice.changed ? new m.HeatAlert() : undefined;
      t.register(station);
      for (const observer of [display, web, ...(alert ? [alert] : [])]) station.subscribe(observer);
      station.setReading(READINGS[0]!);
      if (leaves) station.unsubscribe(display);
      station.setReading(READINGS[1]!);
      shown = { phone: display.shown, web: web.shown, ...(alert && { alerts: alert.alerts }) };
    } else {
      const m = (choice.changed ? naiveChanged : naive) as typeof naiveChanged;
      const display = new m.PhoneDisplay();
      const web = new m.WebDisplay();
      const alert = choice.changed ? new m.HeatAlert() : undefined;
      const station = new m.Station(display, web, alert!);
      t.register(station);
      // The naive station has no way to drop the phone, so leaving changes nothing.
      for (const temp of READINGS) station.setReading(temp);
      shown = { phone: display.shown, web: web.shown, ...(alert && { alerts: alert.alerts }) };
    }
    const expected = leaves ? READINGS.slice(0, 1) : READINGS;
    const ok = shown.phone.length === expected.length;
    const facts: [string, string][] = [
      ['Phone', degrees(shown.phone)],
      ['Web', degrees(shown.web)],
    ];
    if (shown.alerts) facts.push(['Alerts', degrees(shown.alerts)]);
    return {
      ok,
      title: ok ? `Every display got ${leaves ? 'only the readings it asked for' : 'both readings'}` : 'The phone got a reading after it left',
      why: ok
        ? choice.pattern
          ? 'The station told whoever was subscribed at the time, and nobody else.'
          : 'The station called each display by name, which works while nobody needs to leave.'
        : 'The station holds the phone in a field and calls it every time. There is no way to stop, so the closed app was sent 31°.',
      facts,
    };
  },
  notes: {
    'Station.subscribe': 'A display asks the station to tell it about new readings. The station adds it to its list.',
    'Station.unsubscribe': 'The phone app closes, so the phone asks to be taken off the list.',
    'Station.setReading': 'A new temperature arrives at the station.',
    'PhoneDisplay.update': 'The station tells the phone, through the one method every subscriber has.',
    'WebDisplay.update': 'The station tells the web page the same way, without knowing what kind of display it is.',
    'HeatAlert.update': 'The new alert is just another subscriber. It only acts when the reading is over 30°.',
    'PhoneDisplay.show': 'The station calls the phone by name.',
    'WebDisplay.show': 'The station calls the web page by name.',
    'HeatAlert.check': 'The station had to be edited to call the new alert by name too.',
  },
};
