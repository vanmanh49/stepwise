import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { ArrayView, Step } from '../../types/visualization';
import { MARKERS, render, reply, SYSTEMS, USER_MESSAGES, type Message } from '../standin';
import { EMPTY, messageGrid } from '../steps';

export const chatTemplatesCode = `messages = [
  { role: 'system', content: system },   // skipped when empty
  { role: 'user', content: user },
]
tokens = []
for (const m of messages) {
  tokens.push('<|' + m.role + '|>', ...words(m.content), '<|end|>')
}
if (addGenerationPrompt) tokens.push('<|assistant|>')   // "your turn"
reply = model.continue(tokens)   // a rule-based stand-in here`;

export const SYSTEM_IDS = SYSTEMS.map((s) => s.id);
export const USER_IDS = USER_MESSAGES.map((u) => u.id);
export const ON_OFF = ['on', 'off'];

const line = (snippet: string) => lineOf(chatTemplatesCode, snippet);
const MARKER_SET = new Set(Object.values(MARKERS));

function streamView(tokens: string[], replyFrom = tokens.length): ArrayView {
  return {
    kind: 'array',
    cells: tokens.map((t, i) => ({ id: `t-${i}`, value: t, role: i >= replyFrom ? 'found' : MARKER_SET.has(t) ? 'active' : 'default' })),
  };
}

export function chatTemplatesSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't build this chat", why, EMPTY);
  const system = readChoice(values, 'system', 'System prompt', SYSTEM_IDS);
  if (!system.ok) return fail(system.why);
  const user = readChoice(values, 'user', 'User message', USER_IDS);
  if (!user.ok) return fail(user.why);
  const prompt = readChoice(values, 'generationPrompt', 'Generation prompt', ON_OFF);
  if (!prompt.ok) return fail(prompt.why);

  const messages: Message[] = [
    { speaker: 'system', content: SYSTEMS.find((s) => s.id === system.value)!.text, key: system.value },
    { speaker: 'user', content: USER_MESSAGES.find((u) => u.id === user.value)!.text, key: user.value },
  ];
  const shown = messages.filter((m) => m.content !== '');
  const steps: Step[] = [
    {
      title: `A chat with ${shown.length} message${shown.length === 1 ? '' : 's'}: ${shown.map((m) => m.speaker).join(' and ')}`,
      why: 'A chat app keeps messages with roles. The model itself only reads one long list of tokens, so the messages must be flattened first. In this lesson a rule-based stand-in plays the model; real models learn these rules in training.',
      codeLine: line('messages = ['),
      view: messageGrid(shown, 'msg'),
    },
  ];
  for (let i = 1; i <= shown.length; i++) {
    const m = shown[i - 1]!;
    const tokens = render(shown.slice(0, i), false);
    steps.push({
      title: `Wrap the ${m.speaker} message in ${MARKERS[m.speaker]} … ${MARKERS.end}`,
      why: `Special marker tokens tell the model where each message starts, who wrote it, and where it ends. The stream is now ${tokens.length} tokens.`,
      codeLine: line("tokens.push('<|' + m.role"),
      variables: { tokens: tokens.length },
      view: streamView(tokens),
    });
  }
  const on = prompt.value === 'on';
  const tokens = render(shown, on);
  steps.push(
    on
      ? {
          title: `Add the generation prompt ${MARKERS.assistant}`,
          why: 'An open assistant marker at the end says "the assistant speaks next". The model continues the stream from there, so what it writes is the reply.',
          codeLine: line('if (addGenerationPrompt)'),
          variables: { tokens: tokens.length },
          view: streamView(tokens),
        }
      : {
          title: `No generation prompt: the stream ends with the user's ${MARKERS.end}`,
          why: 'Nothing marks whose turn it is. The model just continues the most likely text, and after a user message that is often more user text.',
          codeLine: line('if (addGenerationPrompt)'),
          variables: { tokens: tokens.length },
          view: streamView(tokens),
        },
  );
  const r = reply(messages, { generationPrompt: on });
  const text = r.kind === 'tool-call' ? '' : r.text;
  const words = text.split(' ');
  const withReply = on ? [...tokens, ...words, MARKERS.end] : [...tokens.slice(0, -1), ...words, MARKERS.end];
  const replyFrom = on ? tokens.length : tokens.length - 1;
  steps.push({
    title: on ? `The model replies as the assistant: "${text}"` : `The model kept writing the user's message: "${text}"`,
    why: on
      ? system.value === 'pirate'
        ? 'The system message came first in the stream, so it shapes every reply: here, pirate talk.'
        : 'The reply is just the tokens the model writes after the assistant marker, until it writes the end marker.'
      : 'Without the assistant marker, the stand-in continues the user\'s turn, as a real model often does. Chat libraries add the generation prompt for you; forgetting it is a classic bug when building prompts by hand.',
    next: 'The whole stream has to fit in the model\'s context window. The next lesson shows what happens when it doesn\'t.',
    codeLine: line('reply = model.continue(tokens)'),
    variables: { tokens: withReply.length },
    view: {
      kind: 'panels',
      panels: [
        { label: 'What the model sees', view: streamView(withReply, replyFrom) },
        { label: 'The chat', view: messageGrid([...shown, { speaker: on ? 'assistant' : 'user (continued)', content: text }], 'chat', (i) => (i === shown.length ? 'found' : 'default')) },
      ],
    },
  });
  return steps;
}
