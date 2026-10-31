import { ATTACK_OPTIONS, csrfCode, csrfSteps, DEFENSE_OPTIONS } from '../../security/scenarios/csrf';
import type { LessonContent } from '../../types/lesson';

const [FORM, IMAGE] = ATTACK_OPTIONS;
const [NONE, SAME_SITE, TOKEN, ORIGIN] = DEFENSE_OPTIONS;
const defaults = { attack: FORM!, defense: NONE! };
const onEvilPage = csrfSteps({ attack: FORM!, defense: SAME_SITE! }).at(-2)!;

const content: LessonContent = {
  overview:
    'A browser adds cookies to requests by itself. So a page on another site can make your browser send a request to a site where you are signed in, and the server sees a normal request from you. That is cross-site request forgery. Here a page on evil.example places an order in alice\'s name, and four settings try to stop it.',
  concept: [
    'CSRF does not steal anything. The attacker never sees the cookie or the answer. The attack only needs the request to happen, which is enough to place an order or change an email address.',
    'The same-origin policy does not help, because it controls reading, not sending. A form on any page may post to any site, and an image tag may ask for any address.',
    'SameSite tells the browser when to send a cookie across sites. A Lax cookie stays home for a cross-site POST or image, and goes with a click on a link. Strict stays home for those too. None allows the cookie across sites and needs Secure, though Firefox and Safari still limit third-party cookies, and this simulation behaves like Chrome. Not every browser defaults to Lax, so set it yourself.',
    'A CSRF token is a random value tied to the session, placed in the shop\'s own form. The attacker can make the browser send a request, but can\'t read the shop\'s page, so the attacker doesn\'t know the token.',
    'The origin header says which origin sent a request. Browsers add it to a POST, so a check can refuse evil.example. An image request has no origin header, so a check that lets a missing header pass waves it through.',
    'That last case points at the real flaw: GET must not change state, because Lax cookies go with a link and origin checks often skip it. In production, use your framework\'s CSRF protection, keep every change behind POST, PUT or DELETE, set SameSite on session cookies, and treat a missing origin on a change as a refusal.',
  ],
  howItWorks: [
    'alice signs in, and the browser keeps the cookie.',
    'alice opens a page on another site.',
    'That page sends a request to the shop with no click.',
    'The browser decides whether to add the cookie, from SameSite.',
    'The shop checks a token or the origin, then places the order or refuses.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'A form posts to /orders. An image asks for /orders/new, a GET that changes state.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'None means SameSite=None and no check. SameSite means Lax.' },
    ],
    presets: [
      { label: 'Form', values: defaults },
      { label: 'Image', values: { attack: IMAGE!, defense: NONE! } },
      { label: 'SameSite', values: { attack: FORM!, defense: SAME_SITE! } },
      { label: 'Token', values: { attack: FORM!, defense: TOKEN! } },
      { label: 'Origin beats the form', values: { attack: FORM!, defense: ORIGIN! } },
      { label: 'Image beats Origin', values: { attack: IMAGE!, defense: ORIGIN! } },
    ],
    generate: csrfSteps,
    codeLabel: 'Pseudocode',
  },
  code: csrfCode,
  prosCons: {
    pros: ['SameSite is one flag on a cookie', 'A token works in any browser', 'An origin check needs no stored state'],
    cons: ['A token must reach every form and script', 'An origin check must decide what a missing header means', 'XSS beats all of them, because a script runs on the site itself'],
    useWhen: ['Any site that uses cookies for sign-in and changes data'],
    avoidWhen: ['Changing state on a GET', 'Trusting that a request carrying a cookie came from the site itself'],
  },
  applications: [
    'Forms that place orders or move money',
    'Account settings such as email and password',
    'Admin actions behind a signed-in cookie',
  ],
  commonMistakes: [
    'Changing state on a GET, which an image or a link can trigger.',
    'Letting a missing origin header pass on a change.',
    'Using a token that is the same for every user, or never checking it.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The session cookie is SameSite=Lax. This page on evil.example now posts a form to the shop. What does the shop see?',
      view: onEvilPage.view,
      options: ['A request with no cookie, so it answers 401', 'alice\'s session, so it places the order', 'A valid CSRF token', 'Nothing: the request is never sent'],
      answer: 0,
      explanation: 'The browser sends the POST, but leaves a Lax cookie off a cross-site form post.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why can\'t evil.example just copy the CSRF token into its form?',
      options: ['The same-origin policy stops it reading the shop\'s page', 'Tokens are encrypted', 'Forms can\'t hold tokens', 'The token is in an HttpOnly cookie'],
      answer: 0,
      explanation: 'The attacker can cause a request, but can\'t read what comes back.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which request gets past this check, with a SameSite=None cookie?',
      code: 'if (request.origin && request.origin != shop) return 403',
      options: ['A GET from <img src=...>, which has no origin header', 'A form POST from evil.example', 'A fetch PUT from evil.example', 'None'],
      answer: 0,
      explanation: 'With no header, the condition is false and the request passes. A GET must not change state.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What does CSRF give the attacker?',
      options: ['A request made as the victim, with no view of the answer', 'The victim\'s password', 'The session cookie', 'The page\'s content'],
      answer: 0,
      explanation: 'It is a forged action, not a theft. That is why reading rules don\'t stop it.',
    },
  ],
  summary: [
    'Browsers add cookies by themselves, whoever started the request.',
    'CSRF forges an action and reads nothing.',
    'SameSite keeps the cookie off cross-site requests.',
    'A token proves the request came from the shop\'s own page.',
    'A GET must not change state.',
  ],
};

export default content;
