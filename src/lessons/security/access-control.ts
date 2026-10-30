import { accessControlCode, accessControlSteps, ATTACK_OPTIONS } from '../../security/scenarios/access-control';
import { DEFENSE_OPTIONS } from '../../security/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[0]! };
const ownOrder = accessControlSteps({ attack: ATTACK_OPTIONS[0]!, defense: DEFENSE_OPTIONS[0]! }).at(-2)!;

const content: LessonContent = {
  overview:
    'Signing in answers "who are you?". Access control answers "what may you do?", and it is the part apps forget most often. This lesson signs in as an ordinary customer and reaches data and powers it should not have, using nothing more than a changed address or an extra form field.',
  concept: [
    'Authentication proves who you are. Authorization decides what you may do. A site can get the first one perfect and still let any signed-in user read everything.',
    'Every request for an object needs its own check. Changing /orders/101 to /orders/102 is the classic attack, known as an insecure direct object reference. The shop must compare the row\'s owner with the signed-in user, every time.',
    'Hiding a button is not a control. The browser shows what the server sent, and the user decides what to send back. An address can be typed, and a request can carry any field, so every rule has to run on the server.',
    'Saving whatever fields arrive is called mass assignment. A form with one field does not stop a request with two. List the fields that may change, and drop the rest.',
    'Access is denied by default here: every page goes through one signed-in check, and each rule runs on the server. In production, keep access rules in one place, test each role against each route, and let your framework deny by default. Broken access control has topped the OWASP Top 10 since 2021.',
  ],
  howItWorks: [
    'Each request passes the signed-in check first, or gets a 401.',
    'The handler loads the row or page the request names.',
    'It compares the user with the rule for that object, and returns 403 if it fails.',
    'An edit keeps only the fields on the allow-list.',
    'Nothing the browser hides or shows changes any of this.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'What a signed-in customer tries.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'Turns on the one control that stops this attack.' },
    ],
    presets: ATTACK_OPTIONS.map((attack) => ({ label: attack, values: { ...defaults, attack } })),
    generate: accessControlSteps,
    codeLabel: 'Pseudocode',
  },
  code: accessControlCode,
  prosCons: {
    pros: ['A server-side check can\'t be bypassed from the browser', 'Deny by default fails safe', 'One place for rules is easy to test'],
    cons: ['Every new route and object needs a rule', 'A single missed check is enough', 'Scanners struggle to find these flaws, because they depend on what the data means'],
    useWhen: ['Every route that returns or changes data'],
    avoidWhen: ['Relying on hidden links, disabled buttons or client-side checks as protection'],
  },
  applications: [
    'Each customer sees only their own orders',
    'Admin pages check the role on every request',
    'Shared documents check permissions per person and per file',
  ],
  commonMistakes: [
    'Checking that a user is signed in, and not that the object is theirs.',
    'Hiding admin links and leaving the admin routes open.',
    'Passing a request body straight into a database update.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'alice is signed in and just opened order 101, alice\'s own. This shop has no ownership check. What happens when alice changes the address to /orders/102?',
      view: ownOrder.view,
      options: ['200: alice reads bob\'s order', '403: it belongs to bob', '401: alice must sign in again', '404: orders are private'],
      answer: 0,
      explanation: 'The shop checks that someone is signed in, and never compares the owner with that person.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What is the difference between 401 and 403?',
      options: ['401 means sign in first, and 403 means you are known but not allowed', '401 means not allowed, and 403 means not found', 'They mean the same thing', '403 means the server is down'],
      answer: 0,
      explanation: '401 is about authentication and 403 about authorization.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What attack does this line stop?',
      code: "editable = allowList ? ['name'] : allColumns",
      options: ['A request that adds role=admin to an account edit', 'A stolen session', 'A guessed password', 'A forged token'],
      answer: 0,
      explanation: 'That is mass assignment. Only listed fields are saved, so an extra field does nothing.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A team hides the admin link from customers. Why is that not enough?',
      options: ['Anyone can type the address, so the server must check the role', 'Customers can see hidden links in the sitemap only', 'Links can\'t be hidden', 'Admins would lose access'],
      answer: 0,
      explanation: 'The link was only a suggestion. The rule has to live on the route.',
    },
  ],
  summary: [
    'Being signed in says who you are, not what you may do.',
    'Check ownership on every object, on every request.',
    'Rules run on the server. Hidden buttons protect nothing.',
    'Allow-list the fields a request may change, and deny by default.',
  ],
};

export default content;
