import { LAYER_OPTIONS, LAYERS, threatModelingCode, threatModelingSteps } from '../../security/scenarios/threat-modeling';
import type { LessonContent } from '../../types/lesson';

const [OFF, ON] = LAYER_OPTIONS;
const allOff = Object.fromEntries(LAYERS.map(({ name }) => [name, OFF!]));
const allOn = Object.fromEntries(LAYERS.map(({ name }) => [name, ON!]));
const onlyLayer = (name: string) => ({ ...allOff, [name]: ON! });
const atTheDoor = threatModelingSteps(allOff).at(-2)!;

const content: LessonContent = {
  overview:
    'Real breaches are rarely one bug. They are a chain of small gaps, each harmless by itself. Threat modeling is how you find those chains before an attacker does, and defense in depth means no single failure ends the story. Here one attack runs from a stored comment to a stolen users table, and you turn on five layers to see where it breaks.',
  concept: [
    'A threat model answers four plain questions. What are we building? What can go wrong? What are we going to do about it? Did we do a good job? It works best with a diagram and a few people in a room, before the code is written.',
    'Start from what is worth protecting, and who might want it. Then follow the data across each trust boundary: every place where it moves between parties that trust each other differently, such as browser to server, or server to database.',
    'Attacks are chains. Here, each link depends on the one before: a comment becomes a script, the script takes the cookie, the cookie opens /admin, and /admin sends the data out. Breaking any link ends the attack.',
    'Layers should be different kinds of control. Encoding fixes input, CSP limits scripts, HttpOnly limits what a script can read, a role check limits what a session can do, and an egress filter limits where data can go. A bug that beats one is unlikely to beat the next.',
    'Assume each layer can fail, and ask what happens then. That is why this lesson lists the later layers that would also have held. A control nobody has tested is a hope rather than a layer.',
    'Keep the list short and ranked, because you can\'t fix everything. In production, teams use frameworks such as STRIDE to prompt the "what can go wrong" step, write the model down, review it when the design changes, and test it with penetration tests and logs that would show each link of the chain.',
  ],
  howItWorks: [
    'mallory posts a comment holding a script.',
    'alice opens the comments, and the script runs.',
    'The script sends alice\'s cookie to evil.example.',
    'The attacker uses the cookie to open /admin.',
    'The attacker makes the shop export its users, and the run stops at the first layer that holds.',
  ],
  visualization: {
    kind: 'form',
    fields: LAYERS.map(({ name, label, help }) => ({ name, label, type: 'choice' as const, sample: OFF!, options: LAYER_OPTIONS, help })),
    presets: [
      { label: 'All off', values: allOff },
      ...LAYERS.map(({ name, label }) => ({ label: `Only ${label}`, values: onlyLayer(name) })),
      { label: 'All on', values: allOn },
    ],
    generate: threatModelingSteps,
    codeLabel: 'Pseudocode',
  },
  code: threatModelingCode,
  prosCons: {
    pros: ['It finds design flaws before they are code', 'It gives security work a clear order', 'Layers mean one mistake is not a breach'],
    cons: ['It takes time from people who know the system', 'A model goes stale as the design changes', 'Layers add cost, and each one must be kept working'],
    useWhen: ['Designing a new feature that handles data or money', 'A big change to how parties trust each other'],
    avoidWhen: ['Treating a finished document as the end of the work', 'Counting two copies of one control as two layers'],
  },
  applications: [
    'A design review before building a payment flow',
    'Deciding which security fix goes first',
    'Planning what logs would show an attack in progress',
  ],
  commonMistakes: [
    'Trusting one strong control, with nothing behind it.',
    'Modeling attackers you find interesting, rather than the likely ones.',
    'Doing it once, and never updating it.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The attacker is on /admin with alice\'s stolen session, and the egress filter is off. What happens when the attacker asks the shop to export to evil.example?',
      view: atTheDoor.view,
      options: ['The users table reaches evil.example', 'The shop refuses, because alice is a customer', 'The browser blocks the request', 'The cookie expires'],
      answer: 0,
      explanation: 'The role check is already off here, and nothing limits where the server may post.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why have an egress filter if the role check is on?',
      options: ['If the role check fails or an admin session is stolen, the data still can\'t leave', 'It makes the role check faster', 'It replaces encoding', 'It stops the script from running'],
      answer: 0,
      explanation: 'Each layer assumes the one before it can fail.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'This shop stopped the attack here. What should it still ask?',
      code: "if (user.role != 'admin') return 403   // the attack ends on this line",
      options: ['Why did a script run and a cookie leave before this check', 'Nothing: the attack was stopped', 'Whether to remove the check', 'How to make the 403 faster'],
      answer: 0,
      explanation: 'The last layer held, but two earlier ones failed, and those are still bugs. An admin\'s session would have passed.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which pair gives the most depth?',
      options: ['Output encoding and an HttpOnly cookie', 'Two blocklists for the same input', 'Two copies of one role check', 'Two firewalls with the same rules'],
      answer: 0,
      explanation: 'They are different kinds of control, so a bug that beats one is unlikely to beat the other.',
    },
  ],
  summary: [
    'Breaches are chains of small gaps.',
    'Threat modeling asks what can go wrong, before it does.',
    'Breaking any link ends the attack.',
    'Layers should be different kinds of control.',
    'Assume each layer can fail, and test it.',
  ],
};

export default content;
