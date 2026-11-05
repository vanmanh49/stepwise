import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const AMOUNTS = ['30,000', '500', '3,000', '150,000'];

export const chainOfResponsibilityLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a CFO level up to 200,000',
  scenario: {
    name: 'amount',
    label: 'Amount',
    options: AMOUNTS,
    help: 'The expense to approve. Team lead approves up to 500, Manager up to 5,000, Director up to 50,000.',
  },
  run(choice, amount, t) {
    const m = (choice.pattern ? (choice.changed ? patternChanged : pattern) : choice.changed ? naiveChanged : naive) as typeof naiveChanged;
    const desk = new m.ExpenseDesk();
    t.register(desk);
    const approver = desk.approve(Number(amount.replaceAll(',', '')));
    const rejected = approver === 'Rejected';
    return {
      ok: true,
      title: rejected ? `Nobody may approve ${amount}, so it is rejected` : `${approver} approves ${amount}`,
      why: choice.pattern
        ? rejected
          ? 'The expense went along the whole chain. Every approver was over its limit, and the last one had nobody to pass it to.'
          : `Each approver checked its own limit and passed the expense on until ${approver} could take it.`
        : rejected
          ? 'ExpenseDesk checked every limit in its if chain, and none was high enough.'
          : `ExpenseDesk checked its if chain from the top and stopped at ${approver}.`,
      facts: [
        ['Amount', amount],
        ['Approved by', approver],
      ],
    };
  },
  notes: {
    'ExpenseDesk.approve': 'The expense arrives at the desk, which has to find someone allowed to approve it.',
    'Approver.setNext': 'The chain is wired once, when the desk is built: each approver is linked to the one after it. That one line is the whole order of the chain.',
    'Approver.handle': 'This approver checks the amount against its own limit. If it is too high, it passes the expense to the next approver.',
  },
};
