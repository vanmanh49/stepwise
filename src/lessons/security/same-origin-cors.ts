import { ATTACK_OPTIONS, CORS_OPTIONS, sameOriginCorsCode, sameOriginCorsSteps } from '../../security/scenarios/same-origin-cors';
import type { LessonContent } from '../../types/lesson';

const [READ, CHANGE] = ATTACK_OPTIONS;
const [NONE, , REFLECT, WILDCARD] = CORS_OPTIONS;
const defaults = { attack: READ!, cors: REFLECT! };
const answerArrived = sameOriginCorsSteps({ attack: READ!, cors: NONE! }).at(-2)!;

const content: LessonContent = {
  overview:
    'A page you open can run code in your browser. The same-origin policy is what stops that page reading your bank account in another tab. CORS is how a server loosens that rule on purpose, and a careless CORS setting gives the protection away. Here a page on evil.example calls a shop where alice is signed in, under four different CORS settings.',
  concept: [
    'An origin is a scheme, a host and a port. https://shop.example and https://app.shop.example are different origins, even though they are one site. By default, a page may only read responses from its own origin.',
    'The same-origin policy controls reading, not sending. A page on evil.example can send a request to the shop, and the shop will answer. The browser then decides whether the page may see the answer. That is why this does not stop CSRF.',
    'CORS is a way for the server to say who may read. access-control-allow-origin names one origin, or * for anyone. A request with cookies also needs access-control-allow-credentials: true, and browsers refuse * for it.',
    'Copying the Origin header into the answer looks like a harmless way to make CORS errors go away. With credentials on, it allows every site on the web to read as the signed-in user. It is worse than *, which browsers refuse.',
    'A PUT, or a request with a custom header, is not simple. The browser sends an OPTIONS preflight first, with no cookies, and only sends the real request if the answer allows it. So here a failed preflight stops the change before it happens.',
    'The same-origin policy is not a server-side control. A script outside a browser ignores it, so the server still has to check who is asking. In production, keep an exact list of allowed origins, avoid reflecting the Origin header, and use * only for data that is truly public.',
  ],
  howItWorks: [
    'A script on one origin calls another.',
    'For a PUT or a custom header, the browser sends an OPTIONS preflight first, and stops if it fails.',
    'The browser sends the request, with cookies if the page asked and the cookie allows it.',
    'The server answers, with its CORS headers.',
    'The browser compares those headers with the page\'s origin, and only then lets the page read the answer.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'What the page on evil.example tries.' },
      { name: 'cors', label: 'CORS policy', type: 'choice', sample: defaults.cors, options: CORS_OPTIONS, help: 'What the shop says about who may read its answers.' },
    ],
    presets: [
      { label: 'Read with Reflect any', values: defaults },
      { label: 'Change with Reflect any', values: { attack: CHANGE!, cors: REFLECT! } },
      { label: 'Read with Wildcard', values: { attack: READ!, cors: WILDCARD! } },
    ],
    generate: sameOriginCorsSteps,
    codeLabel: 'Pseudocode',
  },
  code: sameOriginCorsCode,
  prosCons: {
    pros: ['The browser enforces it for every page, with no work from the site', 'CORS lets a site open one route to one partner', 'A preflight stops a risky request before it is sent'],
    cons: ['It does not stop a request going out', 'It protects nothing from a script outside a browser', 'CORS errors tempt people into settings that turn it off'],
    useWhen: ['A front end on another origin needs to read an API'],
    avoidWhen: ['Reflecting the Origin header with credentials on', 'Treating it as a replacement for sign-in checks'],
  },
  applications: [
    'A front end on app.example calling an API on api.example',
    'A public API or font that any site may read with *',
    'Browsers keeping one tab\'s script out of another tab\'s bank account',
  ],
  commonMistakes: [
    'Copying the Origin header into access-control-allow-origin.',
    'Thinking CORS stops a request from being sent.',
    'Matching allowed origins with a loose check, so shop.example.evil.example passes.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'A page on evil.example fetched /account with cookies. The shop sent no CORS headers, and its answer is now in the browser. What happens next?',
      view: answerArrived.view,
      options: ['The browser keeps the answer from the page', 'The page reads alice\'s account', 'The shop takes the answer back', 'The browser signs alice out'],
      answer: 0,
      explanation: 'The request was sent and answered. With no access-control-allow-origin, the page may not read the result.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why is access-control-allow-origin: * refused for a request with cookies?',
      options: ['It would let every site read as the signed-in user', 'Browsers can\'t parse a star with cookies', 'Stars are only for images', 'It makes the response too large'],
      answer: 0,
      explanation: 'That is the danger the rule exists for, and it is why * is fine only for data that is truly public.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this server code do?',
      code: "headers['access-control-allow-origin'] = request.headers.origin\nheaders['access-control-allow-credentials'] = 'true'",
      options: ['It lets any site read as the signed-in user', 'It allows only the shop\'s own pages', 'It blocks every other site', 'It does nothing without a preflight'],
      answer: 0,
      explanation: 'It repeats whatever origin asked, so every origin passes the browser\'s check.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does a failed preflight stop?',
      options: ['The real PUT is never sent', 'The PUT is sent, but the answer is hidden', 'The cookie is deleted', 'The shop signs alice out'],
      answer: 0,
      explanation: 'The preflight runs first, and the browser sends nothing else if it fails. A simple GET has no preflight, so it does go out.',
    },
  ],
  summary: [
    'A page may send to any origin, but may only read its own by default.',
    'CORS is the server saying who may read.',
    'Reflecting the Origin header with credentials allows everyone.',
    'A preflight stops a risky request before it is sent.',
    'Only browsers enforce this, so the server still checks who is asking.',
  ],
};

export default content;
