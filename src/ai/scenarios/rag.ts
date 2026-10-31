import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { CORPUS, tokenId } from '../corpus';
import { QUESTIONS, reply, type Message, type Question, type Reply } from '../standin';
import { EMPTY, K, messageGrid, resultsGrid } from '../steps';
import { search, type SearchResult, type VectorKind } from '../vectors';

export const ragCode = `words = rewrite(question)   // "What did the dog eat?" → "dog ate"
docs = search(words, k)   // vector search; none = skip retrieval
prompt = [
  system('Answer only from these documents and cite them:', docs),
  user(question),
]
answer = model(prompt)   // a rule-based stand-in here`;

export const RETRIEVERS = ['tfidf', 'dense', 'none'];
export const QUESTION_IDS = QUESTIONS.map((q) => q.id);

const line = (snippet: string) => lineOf(ragCode, snippet);
const INSTRUCTION = 'Answer only from these documents and cite them:';

interface RagRun {
  result?: SearchResult;
  messages: Message[];
  answer: Reply & { kind: 'text' };
}

/** The whole pipeline, shared with the Evals lesson: search (unless retriever is none), build the prompt, ask the stand-in. */
export function runRag(q: Question, k: number, retriever: string): RagRun {
  const user: Message = { speaker: 'user', content: q.text, key: q.id };
  if (retriever === 'none') return { messages: [user], answer: reply([user]) as RagRun['answer'] };
  const result = search(q.query.split(' ').map((w) => tokenId(w)!), k, retriever as VectorKind);
  const docs = result.top.map((d) => `[doc ${d + 1}] ${CORPUS[d]}`).join(' ');
  const messages: Message[] = [{ speaker: 'system', content: `${INSTRUCTION} ${docs}` }, user];
  return { result, messages, answer: reply(messages, { context: result.top }) as RagRun['answer'] };
}

/** "the bone [doc 12]", or the bare text when nothing is cited. */
const answerText = (a: RagRun['answer']) => (a.cites ? `${a.text} ${a.cites.map((c) => `[doc ${c}]`).join(' ')}` : a.text);

export function ragSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't answer this question", why, EMPTY);
  const qid = readChoice(values, 'question', 'Question', QUESTION_IDS);
  if (!qid.ok) return fail(qid.why);
  const k = readInt(values, 'k', 'k', K);
  if (!k.ok) return fail(k.why);
  const retriever = readChoice(values, 'retriever', 'Retriever', RETRIEVERS);
  if (!retriever.ok) return fail(retriever.why);

  const q = QUESTIONS.find((x) => x.id === qid.value)!;
  const run = runRag(q, k.value, retriever.value);
  const steps: Step[] = [
    {
      title: `The question: "${q.text}"`,
      why: 'The tiny world\'s facts live in 30 documents, not in the model. In this lesson a rule-based stand-in plays the model; real models learn to answer from documents and cite them in training.',
      codeLine: line('words = rewrite(question)'),
      view: messageGrid([{ speaker: 'user', content: q.text }], 'q'),
    },
  ];
  if (run.result) {
    steps.push({
      title: `Rewrite it into search words, "${q.query}", and retrieve the top ${k.value} with ${retriever.value === 'tfidf' ? 'TF-IDF' : 'dense vectors'}`,
      why: 'Questions are full of words such as "what" and "did" that no document contains. Rewriting the question into its key words is a common first step.',
      codeLine: line('docs = search(words, k)'),
      variables: { query: q.query, k: k.value },
      view: resultsGrid(run.result.top, run.result.scores, 'res'),
    });
    steps.push({
      title: `Paste the ${k.value} document${k.value === 1 ? '' : 's'} into the prompt, before the question`,
      why: 'The model only knows what is in its context window. Putting the documents there lets it answer about facts it never saw in training, and the instruction asks it to cite them.',
      codeLine: line('prompt = ['),
      view: messageGrid(run.messages, 'prompt'),
    });
  } else {
    steps.push({
      title: 'No retrieval: the prompt has only the question',
      why: 'Without documents the model can only rely on what it learned in training, and nothing in its prompt says what is true here.',
      codeLine: line('docs = search(words, k)'),
      view: messageGrid(run.messages, 'prompt'),
    });
  }
  const a = run.answer;
  const text = answerText(a);
  steps.push({
    title: a.madeUp
      ? `Made up: "${a.text}", said with full confidence`
      : a.cites
        ? `The answer: "${a.text}" [doc ${a.cites[0]}]`
        : `The answer: "${a.text}"`,
    why: a.madeUp
      ? 'This is a hallucination: with nothing to go on, a model still writes a fluent, likely-sounding answer. Retrieval is the usual fix.'
      : a.cites
        ? 'The answer is taken from a document in the prompt, and the citation lets a reader check it.'
        : 'None of the retrieved documents is about this. Saying so is the right answer: the fix is better retrieval (a larger k, or better vectors), not a guess.',
    next: 'Documents are one way to give a model facts. Function calling lets it ask a program instead.',
    codeLine: line('answer = model(prompt)'),
    variables: { answer: text },
    view: messageGrid([...run.messages, { speaker: 'assistant', content: text }], 'chat', (i) => (i === run.messages.length ? (a.madeUp ? 'discarded' : 'found') : 'default')),
  });
  return steps;
}
