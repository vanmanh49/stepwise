import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const PLAYLISTS = ['4 songs', '7 songs', 'Empty'];
const SIZES: Record<string, number> = { Empty: 0, '4 songs': 4, '7 songs': 7 };
const SONGS: [string, number][] = [
  ['Red', 200],
  ['Gold', 180],
  ['Blue', 240],
  ['Jade', 210],
  ['Rose', 190],
  ['Gray', 230],
  ['Teal', 170],
];
/** The 3rd song, so a search that finds it stops before the end. */
const WANTED = 'Blue';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const iteratorLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Store songs in pages of 3',
  scenario: {
    name: 'playlist',
    label: 'Playlist',
    options: PLAYLISTS,
    help: 'How many songs the playlist holds. Three clients then add up the time, look for "Blue" and print the list.',
  },
  run(choice, playlist, t) {
    const m = (choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive) as typeof naive;
    const list = new m.Playlist();
    t.register(list);
    for (const [title, seconds] of SONGS.slice(0, SIZES[playlist] ?? 0)) list.add(new m.Song(title, seconds));
    const total = new m.Duration().total(list);
    const found = new m.Search().find(list, WANTED);
    const printed = new m.Printer().lines(list);
    return {
      ok: true,
      title: printed.length === 0 ? 'Every client handled the empty playlist' : `Every client walked the ${printed.length} songs`,
      why: choice.pattern
        ? 'Each client asked the playlist for an iterator and called next() while hasNext() said yes. None of them knows how the songs are stored.'
        : `Each client looped over playlist.${choice.changed ? 'pages and then each page' : 'songs by index'} itself, so each one depends on how the songs are stored.`,
      facts: [
        ['Total time', clock(total)],
        [`Find "${WANTED}"`, found],
        ['Printed', printed.join(', ') || 'nothing'],
      ],
    };
  },
  notes: {
    'Playlist.add': 'A song is added to the playlist.',
    'Playlist.iterator': 'The client asks the playlist for a fresh iterator, a cursor that starts before the first song.',
    'PlaylistIterator.hasNext': 'The client asks whether there is another song. Only the iterator knows how the songs are stored.',
    'PlaylistIterator.next': 'The iterator hands over the next song and moves its cursor on.',
    'Duration.total': 'The first client adds up how long the playlist plays.',
    'Search.find': 'The second client looks for "Blue" and stops as soon as it finds it.',
    'Printer.lines': 'The third client numbers every song for printing.',
  },
};
