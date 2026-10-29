import { CORPUS } from './corpus';

/**
 * A rule-based stand-in for a chat model. Real models learn roles, grounding and tool use from training;
 * here fixed rules play the model, so every reply can be explained. Rules read each message's `key`
 * (the id of the choice behind it), never its text.
 */
export type Speaker = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  speaker: Speaker;
  content: string;
  /** The choice id behind the message; for a tool result, 'ok' or 'error'. */
  key?: string;
}

export interface Choice {
  id: string;
  text: string;
}

export const SYSTEMS: readonly Choice[] = [
  { id: 'none', text: '' },
  { id: 'helpful', text: 'You are a helpful assistant.' },
  { id: 'pirate', text: 'Talk like a pirate.' },
];

export const USER_MESSAGES: readonly Choice[] = [
  { id: 'hello', text: 'Hi there!' },
  { id: 'sum', text: 'What is 2 + 2?' },
];

export interface Question extends Choice {
  /** The question rewritten into search words from the vocabulary. */
  query: string;
  subject: string;
  verb: string;
  /** What a person marking the answer expects. */
  expected: string;
}

const question = (id: string, text: string, subject: string, verb: string, expected: string): Question => ({ id, text, query: `${subject} ${verb}`, subject, verb, expected });

export const QUESTIONS: readonly Question[] = [
  question('dog-ate', 'What did the dog eat?', 'dog', 'ate', 'bone'),
  question('bird-ate', 'What did the bird eat?', 'bird', 'ate', 'the seed'),
  question('bird-flew', 'Where did the bird fly?', 'bird', 'flew', 'to the tree'),
  question('fish-swam', 'Where did the fish swim?', 'fish', 'swam', 'in the pond'),
  question('cat-likes', 'What does the cat like?', 'cat', 'likes', 'fish'),
  question('dog-played', 'Where did the dog play?', 'dog', 'played', 'in the park'),
  question('dog-chased', 'What did the dog chase?', 'dog', 'chased', 'the ball'),
];

export const REQUESTS: readonly Choice[] = [
  { id: 'weather-paris', text: "What's the weather in Paris?" },
  { id: 'weather-mars', text: "What's the weather on Mars?" },
  { id: 'add', text: 'What is 17 + 25?' },
  { id: 'add-words', text: 'What is 17 + twenty?' },
  { id: 'hello', text: 'Say hello!' },
];

export const MARKERS: Record<Speaker | 'end', string> = {
  system: '<|system|>',
  user: '<|user|>',
  assistant: '<|assistant|>',
  tool: '<|tool|>',
  end: '<|end|>',
};

/** Marker and word tokens; ends with "<|assistant|>" when the generation prompt is on. Empty messages are skipped. */
export function render(messages: Message[], generationPrompt: boolean): string[] {
  const tokens = messages.filter((m) => m.content !== '').flatMap((m) => [MARKERS[m.speaker], ...m.content.split(' '), MARKERS.end]);
  return generationPrompt ? [...tokens, MARKERS.assistant] : tokens;
}

export interface Tool {
  name: string;
  description: string;
  params: { name: string; type: 'string' | 'number' }[];
}

export const TOOLS: readonly Tool[] = [
  { name: 'get_weather', description: 'The current weather in a city', params: [{ name: 'city', type: 'string' }] },
  { name: 'add', description: 'Adds two numbers', params: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }] },
];

/** Made-up weather for the toy tool. */
export const WEATHER: Readonly<Record<string, string>> = { Paris: '18°C and cloudy', Tokyo: '24°C and sunny', Hanoi: '31°C and rainy' };

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** The first problem, e.g. "b must be a number", or undefined when the args fit. */
export function checkArgs(tool: Tool, args: Record<string, unknown>): string | undefined {
  for (const p of tool.params) {
    if (!(p.name in args)) return `${p.name} is required`;
    if (typeof args[p.name] !== p.type) return `${p.name} must be a ${p.type}`;
  }
  const extra = Object.keys(args).find((key) => !tool.params.some((p) => p.name === key));
  return extra === undefined ? undefined : `${extra} is not a parameter of ${tool.name}`;
}

export function runTool(call: ToolCall): { ok: true; result: string } | { ok: false; error: string } {
  const tool = TOOLS.find((t) => t.name === call.name);
  if (!tool) return { ok: false, error: `No tool named ${call.name}` };
  const problem = checkArgs(tool, call.args);
  if (problem) return { ok: false, error: problem };
  if (tool.name === 'add') return { ok: true, result: String((call.args.a as number) + (call.args.b as number)) };
  const city = call.args.city as string;
  const weather = WEATHER[city];
  return weather ? { ok: true, result: weather } : { ok: false, error: `No weather for ${city}` };
}

export type Reply =
  | { kind: 'text'; text: string; madeUp?: boolean; cites?: number[] }
  | { kind: 'tool-call'; call: ToolCall }
  | { kind: 'continue-user'; text: string };

/** The tool call each request needs, if any. */
const CALLS: Record<string, ToolCall> = {
  'weather-paris': { name: 'get_weather', args: { city: 'Paris' } },
  'weather-mars': { name: 'get_weather', args: { city: 'Mars' } },
  add: { name: 'add', args: { a: 17, b: 25 } },
  'add-words': { name: 'add', args: { a: 17, b: 'twenty' } },
};

/** What the stand-in says with no tool to call. */
const NO_TOOL: Record<string, string> = {
  'weather-paris': "I can't check live weather: I have no weather tool.",
  'weather-mars': "I can't check live weather: I have no weather tool.",
  add: '17 + 25 = 42.',
  'add-words': '17 + 20 = 37.',
};

const CONTINUATIONS: Record<string, string> = { hello: 'How are you today?', sum: 'And what is 3 + 3?' };

function afterTool(request: string | undefined, result: Message): string {
  if (result.key === 'error') return `Sorry, I couldn't do that: ${result.content}.`;
  if (request === 'weather-paris') return `It is ${result.content} in Paris.`;
  if (request === 'add') return `17 + 25 = ${result.content}.`;
  return result.content;
}

/** The first context document with the subject before the verb; the answer is the words after the verb. */
function grounded(q: Question, context: number[]): Reply {
  for (const doc of context) {
    const words = CORPUS[doc]!.split(' ');
    const s = words.indexOf(q.subject);
    const v = words.indexOf(q.verb);
    if (s >= 0 && v > s) return { kind: 'text', text: words.slice(v + 1).join(' '), cites: [doc + 1] };
  }
  return { kind: 'text', text: "The documents don't say." };
}

export function reply(messages: Message[], o: { tools?: readonly Tool[]; context?: number[]; generationPrompt?: boolean } = {}): Reply {
  const last = messages.at(-1);
  const user = messages.findLast((m) => m.speaker === 'user')?.key ?? '';
  const system = messages.find((m) => m.speaker === 'system')?.key;
  if (o.generationPrompt === false) return { kind: 'continue-user', text: CONTINUATIONS[user] ?? '…' };
  if (last?.speaker === 'tool') return { kind: 'text', text: afterTool(user, last) };
  const call = CALLS[user];
  if (call && o.tools?.some((t) => t.name === call.name)) return { kind: 'tool-call', call };
  if (call) return { kind: 'text', text: NO_TOOL[user]! };
  const q = QUESTIONS.find((x) => x.id === user);
  if (q) return o.context ? grounded(q, o.context) : { kind: 'text', text: 'the mat', madeUp: true };
  const pirate = system === 'pirate';
  if (user === 'sum') return { kind: 'text', text: pirate ? 'Arr, 2 + 2 be 4!' : '2 + 2 = 4.' };
  return { kind: 'text', text: pirate ? 'Ahoy! How can I help ye?' : 'Hello! How can I help?' };
}
