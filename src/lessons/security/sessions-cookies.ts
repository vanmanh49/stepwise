import { ATTACK_OPTIONS, sessionsCookiesCode, sessionsCookiesSteps } from '../../security/scenarios/sessions-cookies';
import { DEFENSE_OPTIONS } from '../../security/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[0]! };
const beforeSignOut = sessionsCookiesSteps({ attack: ATTACK_OPTIONS[4]!, defense: DEFENSE_OPTIONS[0]! }).at(-2)!;

const content: LessonContent = {
  overview:
    'Once you sign in, your password stays out of the picture. A session id in a cookie stands in for it on every request, so that cookie is worth stealing. This lesson runs five attacks on a real session and shows the one setting that stops each.',
  concept: [
    'HTTP forgets you between requests. So at sign-in the shop adds a row to a sessions table, gives you the row\'s id in a cookie, and your browser sends it back each time. Whoever sends that id is you.',
    'Cookie flags tell the browser how to guard it. HttpOnly hides a cookie from page scripts. Secure sends it only over https. SameSite decides whether it goes with requests started by other sites, and with no flag at all browsers treat it as Lax.',
    'The id itself matters too. It must be random, or an attacker can work out the next one. It must change at sign-in, or an attacker who planted an id before you signed in holds your session after.',
    'Signing out has to happen on the server. Clearing the cookie only changes your own browser, so a copy still works until the row is deleted.',
    'This browser enforces those cookie rules for real, against a simulated shop. In production, use your framework\'s session library, set Secure, HttpOnly and SameSite together, expire idle sessions, and send every page over https with HSTS so the old http link can\'t happen.',
  ],
  howItWorks: [
    'Sign-in checks the password, adds a session row and sets the cookie.',
    'The browser decides on each request whether the cookie goes with it.',
    'Each attack tries to get a working id: reading it, hearing it, planting it, guessing it or keeping it.',
    'The attacker sends that id from a browser of their own.',
    'The session row decides what happens: a match is signed in, and no match is a 401.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'How the attacker gets a session id.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'Turns on the one control that stops this attack.' },
    ],
    presets: ATTACK_OPTIONS.map((attack) => ({ label: attack, values: { ...defaults, attack } })),
    generate: sessionsCookiesSteps,
    codeLabel: 'Pseudocode',
  },
  code: sessionsCookiesCode,
  prosCons: {
    pros: ['The server can end a session at once', 'The cookie holds no user data', 'The browser sends it for you and guards it with flags'],
    cons: ['Every request needs a session lookup', 'Stolen ids work until they end', 'Cookies go with requests automatically, which is what CSRF exploits'],
    useWhen: ['A website signs its own users in'],
    avoidWhen: ['Many separate services must each verify a user with no shared store: signed tokens can fit better'],
  },
  applications: [
    'Almost every signed-in website keeps a session cookie',
    'Account pages list your active sessions and let you end them',
    'Banks expire idle sessions after a few minutes',
  ],
  commonMistakes: [
    'Keeping the same session id across sign-in, which allows session fixation.',
    'Clearing the cookie at sign-out and leaving the server row alive.',
    'Making ids from a counter, a time or a user id instead of a secure random generator.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'alice has signed out, and the attacker still holds a copy of the old cookie. Here the shop did not delete the row. What happens when the attacker sends the copy?',
      view: beforeSignOut.view,
      options: ['The attacker is signed in as alice', '401: the cookie was cleared', '403: the browser blocks it', 'alice is asked to approve it'],
      answer: 0,
      explanation: 'Clearing the cookie only changed alice\'s browser. The row still matches the id.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does the HttpOnly flag do?',
      options: ['Hides the cookie from page scripts', 'Sends the cookie over http only', 'Encrypts the cookie', 'Stops the cookie expiring'],
      answer: 0,
      explanation: 'Scripts can\'t read an HttpOnly cookie. The browser still sends it with requests.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why must the session id change at sign-in?',
      code: 'id = rotate ? newId() : (request.cookies.sid ?? newId())',
      options: ['An id the attacker planted before sign-in would otherwise become a signed-in session', 'Cookies can only be set once', 'The old id expires at sign-in anyway', 'It makes the page load faster'],
      answer: 0,
      explanation: 'That is session fixation: the attacker chooses the id, then waits for the victim to sign in on it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A session cookie has the Secure flag. Who can still read it on an https connection?',
      options: ['Nobody on the network: they see only the host', 'Anyone on the same wifi', 'Any website you visit', 'Only other tabs'],
      answer: 0,
      explanation: 'https encrypts the request, so an eavesdropper sees the host but not the cookie. Secure makes sure it is never sent any other way.',
    },
  ],
  summary: [
    'A session id in a cookie stands in for your password on every request.',
    'HttpOnly hides it from scripts, and Secure keeps it off http.',
    'Ids must be random, and must change at sign-in.',
    'Signing out must delete the session on the server.',
  ],
};

export default content;
