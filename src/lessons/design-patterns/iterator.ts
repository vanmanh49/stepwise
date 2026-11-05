import { iteratorLesson as lesson } from '../../patterns/iterator/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', playlist: '7 songs' });
const gotBlue = steps.findIndex((step) => step.title === 'PlaylistIterator#2 returns Song#3');

const content: LessonContent = {
  overview:
    'Code that loops over a collection usually knows how the collection stores its items. The Iterator pattern hides that behind a small cursor object with two questions, "is there another item?" and "give me the next one". This lesson walks a playlist with three clients, one adding up the time, one searching for "Blue" and one printing, then changes how the playlist stores its songs.',
  concept: [
    'In the naive design, Playlist keeps its songs in an array, and Duration, Search and Printer each loop over playlist.songs by index. That is ordinary code and it works. But all three clients now depend on the array.',
    'With the pattern, Playlist.iterator() hands each client a PlaylistIterator. The client calls hasNext() and next() and never touches the array. Watch the search on 7 songs: after next() returns Song#3, which is Blue, the search returns at once and asks for nothing more. An empty playlist works too: the first hasNext() says false, so the total is 0:00 and the search says not found.',
    'The change stores the songs in pages of 3, the way a long list loads a page at a time. Without the pattern, every client loops over pages and then over each page, so 4 classes are edited, 15 lines added and 6 removed. With the pattern, only Playlist and PlaylistIterator change, 10 lines added and 4 removed, and the three clients are untouched. Both designs give the same answers before and after.',
    'The cost is one more class, and a cursor that can go stale: if songs are added while an iterator is walking, what it sees depends on how it was written.',
    'In real code, JavaScript\'s for…of is this pattern built in: an object with a Symbol.iterator method returns an iterator whose next() gives { value, done }, and arrays, Maps, Sets and generators all provide one. This lesson spells out hasNext() and next() so every step shows in the sequence. Database cursors and paginated API clients work the same way.',
  ],
  howItWorks: [
    'Give the collection a method that returns a new iterator.',
    'The iterator keeps its own position in the collection.',
    'hasNext() says whether another item is left; next() returns it and moves on.',
    'Clients loop with the iterator and never see how items are stored.',
    'A new storage layout changes the collection and its iterator, not the clients.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Clients don\'t depend on how the collection stores items', 'Several walks can run at once, each with its own position', 'A client can stop early without reading the rest'],
    cons: ['One more class per kind of collection', 'Changing the collection during a walk gives surprising results', 'Slower than a plain index loop for a simple array'],
    useWhen: ['The storage might change, or there are several kinds of collection to walk the same way', 'Items come in lazily, such as pages from a server or rows from a database'],
    avoidWhen: ['It is a plain array, which already has for…of', 'Only one piece of code ever walks the collection'],
  },
  applications: [
    'for…of with Symbol.iterator in JavaScript',
    'Database cursors that fetch rows as you go',
    'API clients that walk paginated results',
  ],
  commonMistakes: [
    'Adding or removing items while an iterator is walking the collection.',
    'Reusing a finished iterator, which has nothing left to give.',
    'Letting the iterator expose the collection\'s storage, which brings the dependency back.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The search for "Blue" just got Song#3 from the iterator, and Song#3 is Blue. What happens next?',
      view: steps[gotBlue]!.view,
      options: ['Search#1 returns "Blue"', 'Search#1 calls PlaylistIterator#2.hasNext()', 'Search#1 calls PlaylistIterator#2.next()', 'Search#1 returns "not found"'],
      answer: 0,
      explanation: 'The search found what it wanted, so it stops. The iterator never has to fetch the songs after Blue.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Storing songs in pages of 3, how many classes did the naive design edit?',
      options: ['4', '2', '1', '0'],
      answer: 0,
      explanation: 'Playlist changed how it stores songs, and Duration, Search and Printer each had to learn to loop over pages.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets a client walk the songs without knowing how they are stored?',
      options: ['while (it.hasNext()) sum += it.next().seconds;', 'for (let i = 0; i < list.songs.length; i++) sum += list.songs[i]!.seconds;', 'this.songs.push(song);', 'return new PlaylistIterator(this);'],
      answer: 0,
      explanation: 'The client only asks the iterator. The index loop reads the array directly, which is what broke when the storage changed.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does the first hasNext() return on an empty playlist?',
      options: ['false', 'true', 'It throws an error', 'undefined'],
      answer: 0,
      explanation: 'There is no song to give, so hasNext() says false and every client\'s loop ends before it starts.',
    },
  ],
  summary: [
    'An iterator walks a collection with hasNext() and next().',
    'Clients never see how the items are stored.',
    'Paging the songs edited 4 classes without the pattern and 2 with it.',
    'for…of and Symbol.iterator are the same idea built into JavaScript.',
  ],
};

export default content;
