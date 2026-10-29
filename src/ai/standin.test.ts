import { describe, expect, it } from 'vitest';
import { tokenId } from './corpus';
import { QUESTIONS, render, reply, runTool, TOOLS, type Message } from './standin';
import { search, type VectorKind } from './vectors';

const ids = (q: string) => q.split(' ').map((w) => tokenId(w)!);
const chat = (system: string, systemText: string, user: string, userText: string): Message[] => [
  { speaker: 'system', content: systemText, key: system },
  { speaker: 'user', content: userText, key: user },
];
const ask = (id: string, kind?: VectorKind, k = 2) => {
  const q = QUESTIONS.find((x) => x.id === id)!;
  const context = kind ? search(ids(q.query), k, kind).top : undefined;
  return reply([{ speaker: 'user', content: q.text, key: q.id }], { context });
};
const textOf = (r: ReturnType<typeof reply>) => (r.kind === 'tool-call' ? '' : r.text);

describe('render', () => {
  it('flattens messages into one stream with role markers', () => {
    expect(render(chat('helpful', 'You are a helpful assistant.', 'hello', 'Hi there!'), true)).toEqual([
      '<|system|>', 'You', 'are', 'a', 'helpful', 'assistant.', '<|end|>', '<|user|>', 'Hi', 'there!', '<|end|>', '<|assistant|>',
    ]);
  });

  it('ends after the user turn without a generation prompt', () => {
    expect(render(chat('helpful', 'You are a helpful assistant.', 'hello', 'Hi there!'), false).at(-1)).toBe('<|end|>');
  });

  it('skips an empty system message', () => {
    expect(render(chat('none', '', 'hello', 'Hi there!'), true)[0]).toBe('<|user|>');
  });
});

describe('reply', () => {
  it('continues the user turn without a generation prompt', () => {
    expect(reply(chat('helpful', 'x', 'hello', 'Hi there!'), { generationPrompt: false }).kind).toBe('continue-user');
  });

  it('answers in pirate style', () => {
    expect(textOf(reply(chat('pirate', 'Talk like a pirate.', 'hello', 'Hi there!')))).toContain('Ahoy');
  });

  it('answers each question from its retrieved document, with a citation', () => {
    for (const q of QUESTIONS.filter((x) => x.id !== 'dog-chased')) {
      const r = ask(q.id, 'tfidf');
      expect(r.kind, q.id).toBe('text');
      if (r.kind !== 'text') continue;
      expect(r.text.toLowerCase(), q.id).toContain(q.expected);
      expect(r.cites, q.id).toHaveLength(1);
      expect(r.madeUp, q.id).toBeFalsy();
    }
  });

  it('cites the dog document for "What did the dog eat?"', () => {
    const r = ask('dog-ate', 'tfidf');
    expect(r).toEqual({ kind: 'text', text: 'the bone', cites: [12] });
  });

  it('needs k = 2 for "What did the dog chase?"', () => {
    expect(textOf(ask('dog-chased', 'tfidf', 1))).toBe("The documents don't say.");
    expect(textOf(ask('dog-chased', 'tfidf', 2))).toBe('the ball');
  });

  it('says the documents do not say when dense retrieval misses', () => {
    const r = ask('dog-ate', 'dense', 5);
    expect(r).toEqual({ kind: 'text', text: "The documents don't say." });
  });

  it('makes up an answer without context', () => {
    expect(ask('dog-ate')).toEqual({ kind: 'text', text: 'the mat', madeUp: true });
  });

  it('calls a tool when one fits the request', () => {
    const call = (key: string) => reply([{ speaker: 'user', content: key, key }], { tools: TOOLS });
    expect(call('weather-paris')).toEqual({ kind: 'tool-call', call: { name: 'get_weather', args: { city: 'Paris' } } });
    expect(call('add')).toEqual({ kind: 'tool-call', call: { name: 'add', args: { a: 17, b: 25 } } });
    expect(call('add-words')).toEqual({ kind: 'tool-call', call: { name: 'add', args: { a: 17, b: 'twenty' } } });
    expect(call('hello').kind).toBe('text');
  });

  it('never calls a tool when none is offered', () => {
    for (const key of ['weather-paris', 'weather-mars', 'add', 'add-words', 'hello']) {
      expect(reply([{ speaker: 'user', content: key, key }]).kind, key).toBe('text');
    }
  });

  it('writes the final answer from a tool result', () => {
    const r = reply([
      { speaker: 'user', content: '', key: 'weather-paris' },
      { speaker: 'tool', content: '18°C and cloudy', key: 'ok' },
    ]);
    expect(textOf(r)).toContain('18°C and cloudy');
  });

  it('apologises for a tool error', () => {
    const r = reply([
      { speaker: 'user', content: '', key: 'weather-mars' },
      { speaker: 'tool', content: 'No weather for Mars', key: 'error' },
    ]);
    expect(textOf(r)).toMatch(/^Sorry.*No weather for Mars/);
  });
});

describe('runTool', () => {
  it('runs the toy tools and checks their arguments first', () => {
    expect(runTool({ name: 'get_weather', args: { city: 'Paris' } })).toEqual({ ok: true, result: '18°C and cloudy' });
    expect(runTool({ name: 'get_weather', args: { city: 'Mars' } })).toEqual({ ok: false, error: 'No weather for Mars' });
    expect(runTool({ name: 'add', args: { a: 17, b: 'twenty' } })).toEqual({ ok: false, error: 'b must be a number' });
    expect(runTool({ name: 'add', args: { a: 17, b: 25 } })).toEqual({ ok: true, result: '42' });
    expect(runTool({ name: 'add', args: { a: 17 } })).toEqual({ ok: false, error: 'b is required' });
  });
});
