import { QUESTION_IDS, RETRIEVERS, ragCode, ragSteps } from '../../ai/scenarios/rag';
import { K } from '../../ai/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { question: 'dog-ate', k: '2', retriever: 'tfidf' };

// The documents are in the prompt; the learner predicts the answer.
const prompted = ragSteps(defaults).at(-2)!;

const content: LessonContent = {
  overview:
    'A model only knows what it learned in training, and when it does not know, it often makes something up. Retrieval-augmented generation (RAG) searches your documents first and pastes the best ones into the prompt, so the model answers from them and cites them. This lesson runs that pipeline with real vector search over the toy sentences and a rule-based stand-in as the model.',
  concept: [
    'Retrieve: turn the question into search words and find the top k documents with vector search.',
    'Augment: paste those documents into the prompt, with an instruction to answer only from them.',
    'Generate: the model answers from the documents and cites the one it used, so a reader can check it.',
    'Without retrieval, a model still writes a fluent answer: a hallucination. With poor retrieval, a good model says the documents don\'t say. The stand-in follows these rules; real models learn them.',
  ],
  howItWorks: [
    'Rewrite the question into search words.',
    'Search the documents and keep the top k.',
    'Build the prompt: an instruction and the documents, then the question.',
    'Let the model answer, citing its document.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'question', label: 'Question', type: 'choice', sample: defaults.question, options: QUESTION_IDS, help: 'For example dog-ate: "What did the dog eat?"' },
      { name: 'k', label: 'k (documents)', type: 'number', sample: defaults.k, help: `${K.min} to ${K.max}.` },
      { name: 'retriever', label: 'Retriever', type: 'choice', sample: defaults.retriever, options: RETRIEVERS, help: 'tfidf, dense (the model\'s embeddings), or none.' },
    ],
    presets: [
      { label: 'Grounded', values: defaults },
      { label: 'No retrieval (made up)', values: { ...defaults, retriever: 'none' } },
      { label: 'k too small', values: { question: 'dog-chased', k: '1', retriever: 'tfidf' } },
      { label: 'Dense misses', values: { ...defaults, retriever: 'dense' } },
    ],
    generate: ragSteps,
    codeLabel: 'Pseudocode',
  },
  code: ragCode,
  prosCons: {
    pros: ['Answers about facts the model never saw, without retraining it', 'Citations let people check the answer', 'Update the documents and the answers change at once'],
    cons: ['Answers are only as good as retrieval: a missed document means a missed answer', 'Pasted documents use up the context window and cost tokens', 'The model can still misread or ignore a document'],
    useWhen: ['Questions about your own, private or changing documents: help centres, internal docs, manuals'],
    avoidWhen: ['General knowledge the model already has, or tasks that need reasoning over the whole collection at once'],
  },
  applications: [
    'Support bots that answer from a help centre and link to the article',
    'Search engines that write an answer with sources',
    'Coding assistants that pull in the relevant files before answering',
  ],
  commonMistakes: [
    'Blaming the model when retrieval found the wrong documents: check what was retrieved first.',
    'Choosing k too small, so the right document just misses the cut.',
    'Not telling the model to answer only from the documents, so it mixes in made-up facts.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The prompt holds the documents and the question "What did the dog eat?". What does the model answer?',
      view: prompted.view,
      options: ['the bone [doc 12]', 'the fish [doc 11]', 'the mat', "The documents don't say."],
      answer: 0,
      explanation: 'Document 12, "the dog ate the bone", answers the question, and the answer cites it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What happens without retrieval?',
      options: ['The model writes a confident answer that may be made up', 'The model always refuses', 'The answer is the same', 'The model searches by itself'],
      answer: 0,
      explanation: 'Without documents, a model still writes the most likely-sounding answer: a hallucination.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'With "dog chased" and k = 1, TF-IDF returns only "the cat chased the bird". What should this line produce?',
      code: 'answer = model(prompt)',
      options: ["The documents don't say.", 'the ball', 'the bird', 'the cat'],
      answer: 0,
      explanation: 'No retrieved document is about the dog chasing something. With k = 2, "the dog chased the ball" is retrieved too.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does the answer cite a document?',
      options: ['So a reader can check where it came from', 'To make it longer', 'Because the model needs it to search', 'Citations change the model\'s weights'],
      answer: 0,
      explanation: 'A citation ties the answer to a source, which builds trust and catches mistakes.',
    },
  ],
  summary: [
    'RAG retrieves documents, pastes them into the prompt, then generates.',
    'The answer is grounded in the documents and cites them.',
    'Without retrieval, models hallucinate; with poor retrieval, they should say so.',
    'Retrieval quality and k decide what the model can answer.',
  ],
};

export default content;
