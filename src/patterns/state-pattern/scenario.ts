import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

type Action = 'submit' | 'approve' | 'reject';
const ACTIONS: Record<string, Action[]> = {
  'Submit, approve': ['submit', 'approve'],
  'Submit, reject, submit, approve': ['submit', 'reject', 'submit', 'approve'],
  'Approve a draft': ['approve'],
};
export const SEQUENCES = Object.keys(ACTIONS);

export const statePatternLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a legal review',
  scenario: {
    name: 'actions',
    label: 'Actions',
    options: SEQUENCES,
    help: 'What the editors do to a new draft, in order. Approving a draft is not allowed: it has to be submitted first.',
  },
  run(choice, actions, t) {
    const doc = new (choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive).Doc();
    t.register(doc);
    const answers = (ACTIONS[actions] ?? []).map((action) => `${action}: ${doc[action]()}`);
    const refused = answers.some((a) => a.includes("Can't"));
    const status = doc.history.at(-1)!;
    return {
      ok: true,
      title: refused ? `The document stays ${status}: that action is not allowed` : `The document is now ${status}`,
      why: choice.pattern
        ? refused
          ? `The ${status} state has no approve of its own, so it falls back to State's answer: refuse, and stay put.`
          : 'Doc handed each action to its current state object, and each state chose the next one.'
        : refused
          ? `The switch in approve has no case for ${status}, so it reaches the default: refuse, and stay put.`
          : 'Each action ran a switch on the status string to find the next status.',
      facts: [
        ['Answers', answers.join(', ')],
        ['History', doc.history.join(' → ')],
      ],
    };
  },
  notes: {
    'Doc.submit': 'An editor submits the document for review.',
    'Doc.approve': 'An editor approves the document.',
    'Doc.reject': 'An editor rejects the document, sending it back.',
    'Doc.move': 'The switch found a case for the status, so the document moves to the next one.',
    'Doc.moveTo': 'The current state picked the next state, and the document switches to it.',
    'Doc.refuse': 'This action is not allowed in the current status, so nothing moves.',
    'Draft.submit': 'A draft knows that submitting sends it to review.',
    'InReview.approve': 'A document in review knows what approving leads to.',
    'InReview.reject': 'A document in review goes back to Draft when it is rejected.',
    'LegalReview.approve': 'After the legal review, approving publishes the document.',
    'LegalReview.reject': 'The legal review can also send the document back to Draft.',
    'State.submit': 'This state has no submit of its own, so it uses the default: refuse.',
    'State.approve': 'This state has no approve of its own, so it uses the default: refuse.',
    'State.reject': 'This state has no reject of its own, so it uses the default: refuse.',
  },
};
