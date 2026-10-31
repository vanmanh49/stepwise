import { agentMemoryCode, agentMemorySteps, MEMORIES } from '../../ai/scenarios/agent-memory';
import type { LessonContent } from '../../types/lesson';

const forgets = agentMemorySteps({ memory: 'none' });
// Just before the email is written, with no memory: the learner predicts the unit.
const beforeEmail = forgets[forgets.findIndex((s) => s.title.startsWith('Call send_email')) - 1]!;

const content: LessonContent = {
  overview:
    'A model remembers nothing between calls: it only knows what is in its context. Agent memory is whatever the app puts back into that context. This lesson runs two sessions: in the first the user says Sam likes °C, and the second asks the agent to email Sam the weather. Whether the email uses °C depends on the memory.',
  concept: [
    'Short-term memory is the context itself: the current task, tool results and recent messages.',
    'Chat memory carries the newest part of the old conversation, cut to a budget. The oldest lines, often the important ones, fall out first.',
    'Long-term memory stores facts outside the model, here as notes, and recalls the relevant ones into the context when needed.',
    'This lesson finds notes by keyword. Real agents usually recall with vector search, as in the Vector Search lesson. The stand-in\'s simulated flaw: it writes °F unless °C is in its context.',
  ],
  howItWorks: [
    'Session 2 starts with only the task in the context.',
    'Chat memory adds the newest old lines that fit the budget.',
    'Notes memory searches the stored notes for the task\'s key words and adds what it finds.',
    'The agent loop runs with that context.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'memory', label: 'Memory', type: 'choice', sample: 'none', options: MEMORIES, help: 'none, chat (the newest old lines), or notes (a long-term store).' },
    ],
    presets: [
      { label: 'Forgets', values: { memory: 'none' } },
      { label: 'Chat only', values: { memory: 'chat' } },
      { label: 'Notes', values: { memory: 'notes' } },
    ],
    generate: agentMemorySteps,
    codeLabel: 'Pseudocode',
  },
  code: agentMemoryCode,
  prosCons: {
    pros: ['Notes survive any number of sessions and context limits', 'Recall puts only the relevant facts into the context', 'Stored facts can be read, fixed or deleted by people'],
    cons: ['Recall can miss a fact, or bring in the wrong one', 'Stored facts go stale unless they are updated', 'Chat memory is cheap but loses the oldest lines first'],
    useWhen: ['Assistants that should remember preferences, people and decisions across sessions'],
    avoidWhen: ['Storing secrets or personal data without the user knowing and agreeing'],
  },
  applications: [
    'Chat assistants with a "memory" of the user\'s preferences',
    'Coding agents that keep project notes between sessions',
    'Support agents that recall a customer\'s history',
  ],
  commonMistakes: [
    'Assuming the model remembers the last session: it only sees its context.',
    'Relying on chat history alone, so the oldest (often most important) lines drop out.',
    'Never updating stored memories, so the agent acts on old facts.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'With no memory, the agent is about to email Sam the weather in Hanoi (31°C). Which unit will the email use?',
      view: beforeEmail.view,
      options: ['°F, because "Sam likes °C" is not in its context', '°C, because the user said so in session 1', 'No unit', 'Both units'],
      answer: 0,
      explanation: 'Session 1 is gone. With the °C preference missing from the context, the flawed model writes 88°F.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why did chat memory still forget the preference?',
      options: ['Only the newest lines fit the budget, and the preference was the oldest', 'Chat memory is never sent to the model', 'The note was deleted', 'The model ignores chat'],
      answer: 0,
      explanation: 'Chat memory keeps the newest 24 words; the first line, the preference, did not fit.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line add to the context?',
      code: "if (memory === 'notes') context.push(...notesMatching(task))   // long-term store",
      options: ['Stored notes that match the task\'s key words', 'The whole old chat, word for word', 'Every note there is, matching or not', 'Nothing'],
      answer: 0,
      explanation: 'Recall searches the store and adds only matching notes, here team and prefs.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Where does a model keep what it learned in an earlier session?',
      options: ['Nowhere: the app has to put it back into the context', 'In its weights, after every chat', 'In the KV cache', 'In the tool results'],
      answer: 0,
      explanation: 'A model does not change between calls; memory is the app\'s job.',
    },
  ],
  summary: [
    'A model only knows what is in its context.',
    'Chat memory keeps the newest lines and loses the oldest.',
    'Long-term memory stores facts and recalls the relevant ones.',
    'Memory is something the app builds, not something the model has.',
  ],
};

export default content;
