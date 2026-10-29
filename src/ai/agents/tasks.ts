import type { ToolCall } from '../standin';
import type { Office } from './office';

/** One sub-goal of a task: a tool call with fixed arguments. */
export interface Goal {
  label: string;
  call: ToolCall;
}

/** What a finished task must satisfy; the critic checks these. 'email' checks a draft body before it is sent. */
export interface Requirement {
  label: string;
  stage: 'email' | 'answer';
  check: (office: Office, text: string) => boolean;
}

export interface Task {
  id: string;
  /** What the user asks. */
  text: string;
  goals: Goal[];
  /** The correct final answer. */
  answer: string;
  /** What the stand-in says when it answers before checking anything. */
  guess: string;
  requirements: Requirement[];
  /** The tools the goals use: the allowlist guard permits only these. */
  allowedTools: string[];
  /** Words that find this task's useful notes in long-term memory. */
  recallWords: string[];
}

const SAM = 'sam@office.test';
const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({ name, args });
const goal = (label: string, name: string, args?: Record<string, unknown>): Goal => ({ label, call: call(name, args) });

const emailedSam: Requirement = { label: 'email sent to Sam', stage: 'answer', check: (o) => o.outbox.some((e) => e.to === SAM) };
const inCelsius: Requirement = { label: 'temperature in °C', stage: 'email', check: (_o, t) => t.includes('°C') && !t.includes('°F') };

function task(t: Omit<Task, 'allowedTools'>): Task {
  return { ...t, allowedTools: [...new Set(t.goals.map((g) => g.call.name))] };
}

const weatherGoals = [goal('get the weather in Paris', 'get_weather', { city: 'Paris' }), goal('get the weather in Tokyo', 'get_weather', { city: 'Tokyo' })];
const emailGoals = (body: string) => [goal("look up Sam's address", 'read_note', { name: 'team' }), goal('email Sam', 'send_email', { to: SAM, body })];
const COMPARE_BODY = 'Tokyo is warmer: 24°C vs 18°C in Paris.';
const dogSearch = goal('search the documents', 'search_docs', { query: 'dog ate' });
const dogNote = goal('save the note dog', 'write_note', { name: 'dog', text: 'the bone [doc 12]' });

export const TASKS: readonly Task[] = [
  task({
    id: 'weather-compare',
    text: 'Is Paris warmer than Tokyo? Email Sam the answer.',
    goals: [...weatherGoals, ...emailGoals(COMPARE_BODY)],
    answer: 'Tokyo is warmer (24°C vs 18°C). I emailed Sam.',
    guess: 'Yes, Paris is warmer.',
    requirements: [emailedSam, { label: 'says Tokyo is warmer', stage: 'answer', check: (_o, t) => t.includes('Tokyo is warmer') }],
    recallWords: ['Sam'],
  }),
  task({
    id: 'rag-note',
    text: 'What did the dog eat? Save the answer in a note called dog.',
    goals: [dogSearch, dogNote],
    answer: 'The dog ate the bone [doc 12]. Saved in the note dog.',
    guess: 'The dog ate the fish.',
    requirements: [
      { label: 'note dog saved', stage: 'answer', check: (o) => (o.notes.dog ?? '').includes('bone') },
      { label: 'cites a doc', stage: 'answer', check: (_o, t) => /\[doc \d+\]/.test(t) },
    ],
    recallWords: [],
  }),
  task({
    id: 'travel-summary',
    text: 'Summarise the note travel-tips.',
    goals: [goal('read travel-tips', 'read_note', { name: 'travel-tips' })],
    answer: 'The tip: pack light and carry a paper map.',
    guess: 'Travel light.',
    requirements: [{ label: 'no email sent', stage: 'answer', check: (o) => o.outbox.length === 0 }],
    recallWords: [],
  }),
  task({
    id: 'sam-weather',
    text: 'Email Sam the weather in Hanoi.',
    goals: [goal('get the weather in Hanoi', 'get_weather', { city: 'Hanoi' }), ...emailGoals('It is 31°C and rainy in Hanoi.')],
    answer: 'I emailed Sam: it is 31°C and rainy in Hanoi.',
    guess: 'It is sunny in Hanoi.',
    requirements: [emailedSam, inCelsius],
    recallWords: ['Sam'],
  }),
  task({
    id: 'sum-and-save',
    text: 'Add 17 and 25 and save the result in a note called sum.',
    goals: [goal('add 17 and 25', 'add', { a: 17, b: 25 }), goal('save the note sum', 'write_note', { name: 'sum', text: '42' })],
    answer: '17 + 25 = 42. Saved in the note sum.',
    guess: '17 + 25 = 32.',
    requirements: [{ label: 'note sum is 42', stage: 'answer', check: (o) => o.notes.sum === '42' }],
    recallWords: [],
  }),
  task({
    id: 'cleanup',
    text: 'Delete the note travel-tips.',
    goals: [goal('delete travel-tips', 'delete_note', { name: 'travel-tips' })],
    answer: 'Deleted the note travel-tips.',
    guess: 'Done.',
    requirements: [{ label: 'travel-tips deleted', stage: 'answer', check: (o) => o.notes['travel-tips'] === undefined }],
    recallWords: [],
  }),
];

/** The pieces the multi-agent orchestrator hands to its researcher and writer. */
export const SUBTASKS: Record<string, Task> = {
  'research-weather': task({ id: 'research-weather', text: 'Find the weather in Paris and Tokyo.', goals: weatherGoals, answer: 'Paris 18°C, Tokyo 24°C.', guess: 'Both mild.', requirements: [], recallWords: [] }),
  'write-weather': task({ id: 'write-weather', text: `Email Sam: ${COMPARE_BODY}`, goals: emailGoals(COMPARE_BODY), answer: 'Emailed Sam.', guess: 'Done.', requirements: [emailedSam], recallWords: [] }),
  'research-dog': task({ id: 'research-dog', text: 'Find what the dog ate, with its document.', goals: [dogSearch], answer: 'the bone [doc 12]', guess: 'the fish', requirements: [], recallWords: [] }),
  'write-dog': task({ id: 'write-dog', text: 'Save "the bone [doc 12]" in a note called dog.', goals: [dogNote], answer: 'Saved in the note dog.', guess: 'Done.', requirements: [], recallWords: [] }),
};

export const taskById = (id: string) => TASKS.find((t) => t.id === id);
