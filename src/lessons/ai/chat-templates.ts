import { chatTemplatesCode, chatTemplatesSteps, ON_OFF, SYSTEM_IDS, USER_IDS } from '../../ai/scenarios/chat-templates';
import type { LessonContent } from '../../types/lesson';

const defaults = { system: 'helpful', user: 'hello', generationPrompt: 'on' };

// Just before the reply, with no generation prompt: the learner predicts what the model writes next.
const noPrompt = chatTemplatesSteps({ ...defaults, generationPrompt: 'off' }).at(-2)!;

const content: LessonContent = {
  overview:
    'A chat looks like separate messages, but a language model only reads one long list of tokens. A chat template flattens the messages into that list, with special marker tokens for each role. This lesson builds the token stream step by step, then lets a rule-based stand-in play the model and reply.',
  concept: [
    'Every message has a role: system (instructions from the app), user (the person) or assistant (the model).',
    'The template wraps each message in markers, such as <|user|> … <|end|>, and joins them into one stream of tokens.',
    'The generation prompt is an open <|assistant|> marker at the end. It tells the model that the assistant speaks next, so what it writes is the reply.',
    'The model was trained on streams in exactly this format. That training is what makes it follow the system message and stop at <|end|>; this lesson uses fixed rules in its place.',
  ],
  howItWorks: [
    'Collect the messages: an optional system message, then the user message.',
    'Wrap each one in its role marker and an end marker, and append it to the stream.',
    'Add the generation prompt <|assistant|> at the end.',
    'The model continues the stream; its tokens up to <|end|> are the reply.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'system', label: 'System prompt', type: 'choice', sample: defaults.system, options: SYSTEM_IDS, help: 'none, helpful assistant, or talk like a pirate.' },
      { name: 'user', label: 'User message', type: 'choice', sample: defaults.user, options: USER_IDS, help: 'hello: "Hi there!"; sum: "What is 2 + 2?"' },
      { name: 'generationPrompt', label: 'Generation prompt', type: 'choice', sample: defaults.generationPrompt, options: ON_OFF },
    ],
    presets: [
      { label: 'Plain', values: { ...defaults, system: 'none' } },
      { label: 'With system', values: { ...defaults, user: 'sum' } },
      { label: 'Pirate', values: { ...defaults, system: 'pirate' } },
      { label: 'Forgot generation prompt', values: { ...defaults, generationPrompt: 'off' } },
    ],
    generate: chatTemplatesSteps,
    codeLabel: 'Pseudocode',
  },
  code: chatTemplatesCode,
  prosCons: {
    pros: ['One model can hold a conversation, follow app instructions and answer, all from one token stream', 'The system message gives the app a place for rules the user does not see', 'Markers make it clear where the reply should stop'],
    cons: ['Each model family uses its own markers, so a stream built for one model confuses another', 'Every turn re-sends the whole conversation, which costs tokens', 'Markers typed by a user can confuse the model unless the app escapes them'],
    useWhen: ['Calling a chat model directly from its tokens, or debugging a prompt that behaves strangely'],
    avoidWhen: ['Writing the template by hand when the model\'s library already provides it: use the library\'s chat template'],
  },
  applications: [
    'Chat APIs take a list of messages and apply the template on the server',
    'Open-weight models ship their chat template with the tokenizer',
    'System messages carry an app\'s persona, rules and tool descriptions',
  ],
  commonMistakes: [
    'Forgetting the generation prompt, so the model keeps writing the user\'s message instead of answering.',
    'Using one model\'s markers with another model.',
    'Thinking the model sees separate messages: it sees one stream, and roles exist only as marker tokens.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The stream ends with the user\'s <|end|> and no <|assistant|> marker. What does the model most likely write next?',
      view: noPrompt.view,
      options: ['More text in the user\'s voice', 'A reply as the assistant', 'Nothing at all', 'A new system message'],
      answer: 0,
      explanation: 'Nothing says it is the assistant\'s turn, so the model continues the most likely text, which is often more of the user\'s message.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does the system message do?',
      options: ['Gives instructions from the app that shape every reply', 'Holds the model\'s weights', 'Ends the conversation', 'Stores the user\'s password'],
      answer: 0,
      explanation: 'It is the first message in the stream, and the model was trained to follow it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes the model reply as the assistant?',
      code: "if (addGenerationPrompt) tokens.push('<|assistant|>')",
      options: ['The generation prompt: an open assistant marker at the end', 'Pushing the user message', 'Splitting the content into words', 'None: the model always knows'],
      answer: 0,
      explanation: 'The open marker says the assistant speaks next, so the tokens the model writes are the reply.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How does the model see a chat with three messages?',
      options: ['As one stream of tokens with role markers', 'As three separate inputs', 'As a table of roles', 'Only the last message'],
      answer: 0,
      explanation: 'The template flattens every message into one token stream; roles exist only as marker tokens.',
    },
  ],
  summary: [
    'A chat template flattens role-tagged messages into one token stream.',
    'Marker tokens show where each message starts and ends, and who wrote it.',
    'The generation prompt <|assistant|> tells the model to reply.',
    'Each model family has its own markers; use the one it was trained with.',
  ],
};

export default content;
