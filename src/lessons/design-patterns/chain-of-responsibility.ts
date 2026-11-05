import { chainOfResponsibilityLesson as lesson } from '../../patterns/chain-of-responsibility/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', amount: '30,000' });
const atManager = steps.findIndex((step) => step.title === 'TeamLead#1 calls Manager#1.handle(30000)');

const content: LessonContent = {
  overview:
    'Some requests can be handled by one of several objects, and which one depends on the request. The Chain of Responsibility pattern lines those objects up and passes the request along until one of them takes it. This lesson sends expenses of 500, 3,000, 30,000 and 150,000 to approvers with rising limits, then adds a CFO who may approve up to 200,000.',
  concept: [
    'In the naive design, ExpenseDesk.approve holds every limit in one if chain: up to 500 is the Team lead, up to 5,000 the Manager, up to 50,000 the Director, and anything else is rejected. It is short and easy to read. But the desk has to know every level, in order, and nothing else can reuse or reorder them.',
    'With the pattern, each approver is an object with a name, a limit and a link to the next approver. handle(amount) approves when the amount is within its own limit, and otherwise passes the expense to the next one. The desk only knows the first approver. Run 30,000 and watch the sequence: Team lead passes it to the Manager, the Manager passes it to the Director, and the Director approves it, each call one level deeper.',
    'A limit is allowed, not exceeded: 500 stops at the Team lead. An amount above every limit reaches the end of the chain, and the last approver, with nobody after it, answers Rejected instead of failing.',
    'Adding a CFO shows an honest result. Both designs edit 1 class. The naive desk gains 1 line, a fourth if. The pattern adds a 4-line Cfo class and changes the 1 line that wires the chain. The pattern does not win on lines here. What it buys is that each approver is a separate piece you can reorder, skip or reuse in another chain without touching the others.',
    'In real code, Express and Koa middleware is a chain of responsibility: each function handles the request or calls next(). DOM events bubble the same way, from the clicked element up through its parents until a handler stops them, and logging libraries pass a record through a chain of handlers.',
  ],
  howItWorks: [
    'Give every handler the same method, such as handle(amount).',
    'Give each handler a link to the next one.',
    'A handler either deals with the request or passes it to the next handler.',
    'The sender only knows the first handler in the chain.',
    'Decide what happens at the end, when no handler took the request.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['The sender doesn\'t know which handler will take the request', 'Handlers can be added, removed or reordered by changing the wiring', 'Each handler is small and does one check'],
    cons: ['A request can fall off the end without anyone handling it', 'Following one request means walking the whole chain', 'More classes than a plain if chain'],
    useWhen: ['Several objects may handle a request, and which one depends on the request', 'The set or order of handlers changes, or is configured at run time'],
    avoidWhen: ['The rules are few and fixed, so an if chain is clearer', 'Every request must be handled, and nobody would notice one falling off the end'],
  },
  applications: [
    'Express and Koa middleware with next()',
    'DOM event bubbling from a child up to its parents',
    'Approval workflows, support ticket escalation and logging handlers',
  ],
  commonMistakes: [
    'Forgetting the end of the chain, so an unhandled request throws or is silently lost.',
    'A handler that both handles the request and passes it on, by accident.',
    'Building a loop in the chain, so a request passes around forever.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The Manager has the 30,000 expense, and its limit is 5,000. What happens next?',
      view: steps[atManager]!.view,
      options: ['Manager#1 calls Director#1.handle(30000)', 'Manager#1 returns "Manager"', 'Manager#1 returns "Rejected"', 'ExpenseDesk#1 calls Director#1.handle(30000)'],
      answer: 0,
      explanation: '30,000 is over the Manager\'s limit, so it passes the expense to the next approver, the Director. The desk never talks to the Director directly.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Before the change, who approves 150,000?',
      options: ['Nobody, it is rejected', 'The Director', 'The Manager', 'The CFO'],
      answer: 0,
      explanation: '150,000 is over the Director\'s limit of 50,000, and the Director is last in the chain, so the answer is Rejected.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line passes the expense along when it is over this approver\'s limit?',
      options: ['return this.next ? this.next.handle(amount) : \'Rejected\';', 'if (amount <= this.limit) return this.name;', 'this.next = approver;', 'return this.first.handle(amount);'],
      answer: 0,
      explanation: 'When the amount is too high, the approver hands it to the next one, or answers Rejected if there is none.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Adding the CFO with the pattern edited which existing class?',
      options: ['ExpenseDesk', 'None', 'Director', 'Approver'],
      answer: 0,
      explanation: 'Cfo is a new class, and the one line in ExpenseDesk that wires the chain gains .setNext(new Cfo()).',
    },
  ],
  summary: [
    'Chain of Responsibility passes a request along handlers until one takes it.',
    'The sender only knows the first handler.',
    'An amount over every limit reaches the end and is rejected.',
    'Adding the CFO cost both designs 1 edited class; the pattern makes the levels reorderable, not cheaper.',
  ],
};

export default content;
