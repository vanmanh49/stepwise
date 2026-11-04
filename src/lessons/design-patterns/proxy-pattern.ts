import { proxyPatternLesson as lesson } from '../../patterns/proxy-pattern/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', lookups: 'Same city 3 times' });
const second = steps.findIndex((step) => step.title === 'WeekWidget#1 calls CachedWeather#1.forecast("Hanoi")');

const content: LessonContent = {
  overview:
    'Some objects are slow, remote or sensitive, and you want a say in every call that reaches them. The Proxy pattern puts a stand-in with the same methods in front of the real object, so callers can\'t tell the difference. This lesson puts a caching proxy in front of a slow weather API, then asks for every request to be logged.',
  concept: [
    'In the naive design, three dashboard widgets each hold the WeatherApi and call forecast(city) directly. Every lookup is a real round trip, counted here as 800 ms. When all three widgets ask about Hanoi, the page makes 3 real calls and waits 2400 ms for the same answer.',
    'With the pattern, the widgets hold a CachedWeather instead. It has the same forecast(city) method, so the widgets don\'t change. On a miss it calls the real API and saves the answer; on a hit it answers at once. The sequence shows the second and third lookups stopping at the proxy: 1 real call, 800 ms of waiting. When the three cities differ, the cache can\'t help and all 3 calls go through.',
    'Logging every request shows the second benefit. The naive design has no single place every request passes through, so all 3 widgets are edited: 15 lines added and 3 removed. The proxy already sees every request, so the log is 2 lines in CachedWeather and nothing else changes. It logs cached lookups too, 3 lines for 3 lookups.',
    'A proxy looks like a decorator: both wrap an object and share its methods. A decorator adds behaviour and is meant to be stacked in any mix. A proxy controls access to one real object: it may delay creating it, cache its answers, check permissions, or stand in for something on another machine.',
    'In real code, JavaScript\'s built-in Proxy object wraps any object and intercepts its property reads and calls. HTTP caches and CDNs are proxies in front of a server, and ORMs such as Hibernate hand out lazy-loading proxies that fetch a row only when you first touch it.',
  ],
  howItWorks: [
    'Agree on the methods callers use, such as forecast(city).',
    'Write the proxy with those same methods, holding the real object.',
    'In each method, decide what to do first: check a cache, check access, write a log.',
    'Pass the call on to the real object only when you need to.',
    'Give callers the proxy instead of the real object; their code doesn\'t change.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Controls every call to an object from one place', 'Callers don\'t change, because the methods are the same', 'Caching, logging and access checks stay out of the real object'],
    cons: ['A fast-looking call may be slow on a miss', 'A cache can serve stale answers', 'One more object between caller and callee'],
    useWhen: ['The real object is slow, remote or costly to create', 'Every call must be checked, logged or counted'],
    avoidWhen: ['Callers need to know the call is slow or remote, so hiding it misleads them', 'Answers change every time, so a cache would only serve stale data'],
  },
  applications: [
    'Caching proxies, HTTP caches and CDNs in front of slow services',
    'Lazy loading in ORMs, which fetch a record only when it is first used',
    'Access checks and rate limits in front of an API',
  ],
  commonMistakes: [
    'Caching answers that go out of date, with no expiry.',
    'Giving the proxy different methods from the real object, so callers must change after all.',
    'Hiding a slow network call so well that callers make it in a tight loop.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Today has already looked up Hanoi. Now Week asks the proxy for Hanoi. What happens next?',
      view: steps[second]!.view,
      options: ['CachedWeather#1 returns the saved forecast', 'CachedWeather#1 calls WeatherApi#1.forecast("Hanoi")', 'WeekWidget#1 calls WeatherApi#1 itself', 'The proxy throws, because Hanoi was already asked'],
      answer: 0,
      explanation: 'The proxy saved Hanoi\'s forecast the first time, so it answers from its cache without calling the API.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With the proxy, how many real API calls do 3 lookups of the same city make?',
      options: ['1', '3', '0', '2'],
      answer: 0,
      explanation: 'Only the first lookup misses the cache. The other two are answered by the proxy.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets the proxy skip the real API?',
      options: ['if (saved !== undefined) return saved;', 'const fresh = this.api.forecast(city);', 'this.calls += 1;', 'return `Today: ${this.weather.forecast(city)}`;'],
      answer: 0,
      explanation: 'When the city is in the cache, the proxy returns before it reaches the line that calls the API.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why did logging every request edit only one class with the pattern?',
      options: ['Every request already passes through the proxy', 'The widgets log for themselves', 'The API logs its own calls', 'Logging needs no code'],
      answer: 0,
      explanation: 'The proxy is the one place every lookup goes through, so the log goes there once.',
    },
  ],
  summary: [
    'A proxy stands in front of a real object, with the same methods.',
    'It decides what reaches the real object: here, only cache misses.',
    '3 lookups of one city made 3 real calls without the proxy, and 1 with it.',
    'Logging every request edited 3 widgets without the pattern, and only the proxy with it.',
  ],
};

export default content;
