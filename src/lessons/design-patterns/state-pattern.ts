import { statePatternLesson as lesson } from '../../patterns/state-pattern/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', actions: 'Submit, approve' });
const inReview = steps.findIndex((step) => step.title === 'Doc#1 calls InReview#1.approve(Doc#1)');

const content: LessonContent = {
  overview:
    'Some objects behave differently depending on what state they are in. A document can be approved while it is in review, but not while it is still a draft. The State pattern gives each state its own class, and the object hands every action to its current state. This lesson moves a document from Draft to In review to Published, tries an action that is not allowed, then adds a legal review step.',
  concept: [
    'In the naive design, Doc keeps a status string, and submit, approve and reject each start with a switch on it. Each switch lists the statuses where the action is allowed and refuses everything else in its default. It is readable while there are three states, but the rules for one state are spread across every action.',
    'With the pattern, Draft, InReview and Published are classes that share a State base. Doc.approve() just calls this.state.approve(this), and the state decides: InReview moves the document to Published, while the base State answers every action with a refusal. A state only writes the actions it allows. Run "Approve a draft": Draft has no approve of its own, so State refuses, and the document stays in Draft. Both designs give the same message.',
    'The legal review gives an honest result. Without the pattern, Doc gains 3 lines, and its switches grow from 3 cases to 5. With the pattern, a new LegalReview class and a changed line in InReview add 9 lines. The pattern costs more lines here. What it buys is that everything about the legal review is in one class, and no action\'s switch had to be found and edited.',
    'State looks like Strategy: an object holds another object and calls it. The difference is who changes it. A strategy is picked from outside, like the discount rule a cart is given. A state replaces itself: InReview decides that approving leads to the next state.',
    'In real code, TCP connections are the classic example: LISTEN, ESTABLISHED and CLOSE_WAIT each answer the same packets differently. Checkout flows, media players and game characters are written as state machines too, and libraries such as XState describe states and transitions as data.',
  ],
  howItWorks: [
    'Give every state its own class with the same actions.',
    'The object keeps its current state and hands every action to it.',
    'A state handles the actions it allows and refuses the rest, often through a shared default.',
    'To change state, the current state gives the object a new state object.',
    'A new state is a new class; only the states that lead to it change.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Everything about one state is in one class', 'No switch on a status string in every action', 'Actions a state does not allow are refused in one place'],
    cons: ['One class per state, which is more code for small machines', 'The whole flow is spread across classes, so it is harder to see at once', 'States that need shared data have to reach back into the object'],
    useWhen: ['An object has several states, and most actions depend on them', 'States and transitions are added over time'],
    avoidWhen: ['There are two states and a boolean says it all', 'The flow is simpler to read as one table of transitions'],
  },
  applications: [
    'TCP connection states',
    'Order and checkout flows, document workflows',
    'Media players and game characters',
  ],
  commonMistakes: [
    'Keeping a status string as well as the state object, so the two drift apart.',
    'Letting the object choose the next state, which brings the switch back.',
    'Forgetting what an action does in a state that should refuse it.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Doc#1 handed approve to its current state, InReview#1. What happens next?',
      view: steps[inReview]!.view,
      options: ['InReview#1 calls Doc#1.moveTo(Published#1)', 'InReview#1 calls Doc#1.refuse("approve")', 'Doc#1 calls Published#1.approve(Doc#1)', 'Doc#1 returns "In review"'],
      answer: 0,
      explanation: 'Approving is allowed in review, so InReview tells the document to move to a new Published state.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What happens when an editor approves a draft?',
      options: ["It is refused, and the document stays in Draft", 'The document is published', 'The document moves to In review', 'The program throws an error'],
      answer: 0,
      explanation: 'Draft has no approve of its own, so the default in State refuses. The naive switch reaches its default and refuses too.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line lets the document behave differently in each state?',
      options: ['return this.state.approve(this);', 'switch (this.status) {', 'this.history.push(state.name);', "name = 'Published';"],
      answer: 0,
      explanation: 'The document hands the action to whatever state object it holds. The switch is how the naive design does it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Adding the legal review, which design added more lines?',
      options: ['The pattern, 9 against 3', 'The naive design', 'Both added the same', 'Neither added any'],
      answer: 0,
      explanation: 'The new LegalReview class is longer than two extra cases. The pattern kept the new state in one class instead.',
    },
  ],
  summary: [
    'State gives each state its own class.',
    'The object hands every action to its current state.',
    'A state that does not allow an action refuses it, and nothing moves.',
    'The legal review cost more lines with the pattern, but stayed in one class.',
  ],
};

export default content;
