import { design, type Outcome, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const PAGES = ['Upload', 'Search', 'Profile'];

/** What each page means to ask for: the scenario checks the built request against it. */
const WANTED: Record<string, { timeoutMs: number; retries: number }> = {
  Profile: { timeoutMs: 10000, retries: 0 },
  Upload: { timeoutMs: 30000, retries: 3 },
  Search: { timeoutMs: 5000, retries: 2 },
};

type Built = { timeoutMs: number; retries?: number; send(): string };
type Pages = { ProfilePage: new () => { load(): Built }; UploadPage: new () => { save(photo: string): Built }; SearchPage: new () => { find(text: string): Built } };

function outcome(request: Built, sent: string, page: string, changed: boolean): Outcome {
  const wanted = WANTED[page]!;
  const timeoutOk = request.timeoutMs === wanted.timeoutMs;
  const retriesOk = !changed || request.retries === wanted.retries;
  const ok = timeoutOk && retriesOk;
  return {
    ok,
    title: ok ? `The ${page} page sent the request it meant to` : `The ${page} page sent the wrong settings`,
    why: ok
      ? 'Every setting reached the field it was meant for.'
      : 'Timeout and retries are both numbers next to each other, so passing them in the wrong order still compiles. Nothing at the call site says which is which.',
    facts: [
      ['Request', sent],
      ['Timeout', timeoutOk ? `${request.timeoutMs} ms` : `${request.timeoutMs} ms, wanted ${wanted.timeoutMs} ms`],
      ...(changed ? [['Retries', retriesOk ? `${request.retries}` : `${request.retries}, wanted ${wanted.retries}`] as [string, string]] : []),
    ],
  };
}

export const builderLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add retries',
  scenario: { name: 'page', label: 'Page', options: PAGES, help: 'Which page sends its request. Upload wants 3 retries and Search 2 once retries exist.' },
  run(choice, page, t) {
    const m: Pages = choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive;
    let request: Built;
    if (page === 'Profile') {
      const p = new m.ProfilePage();
      t.register(p);
      request = p.load();
    } else if (page === 'Upload') {
      const p = new m.UploadPage();
      t.register(p);
      request = p.save('cat.jpg');
    } else {
      const p = new m.SearchPage();
      t.register(p);
      request = p.find('shoes');
    }
    return outcome(request, request.send(), page, choice.changed);
  },
  notes: {
    'UploadPage.save': 'The upload page builds a POST request with a long timeout.',
    'SearchPage.find': 'The search page builds a JSON request with a short timeout.',
    'ProfilePage.load': 'The profile page builds a plain GET request with the defaults.',
    'RequestBuilder.post': 'Each builder method sets one named setting and returns the builder, so the next call can follow.',
    'RequestBuilder.asJson': 'Each builder method sets one named setting and returns the builder, so the next call can follow.',
    'RequestBuilder.timeout': 'The call says timeout(...) by name, so the number can\'t land in the wrong field.',
    'RequestBuilder.retries': 'The call says retries(...) by name, so the number can\'t land in the wrong field.',
    'RequestBuilder.build': 'build makes the Request from everything set so far. It is the only place that calls the long constructor.',
    'Request.send': 'The client sends the request it got back.',
  },
};
