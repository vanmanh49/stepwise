import { evalsCode, evalsSteps, GRADERS } from '../../ai/scenarios/evals';
import { RETRIEVERS } from '../../ai/scenarios/rag';
import { K } from '../../ai/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { retriever: 'tfidf', k: '2', grader: 'contains' };

// Strict grader, after the first case: the learner predicts how case 1 is graded.
const strictStart = evalsSteps({ ...defaults, grader: 'exact' })[0]!;

const content: LessonContent = {
  overview:
    'Change a prompt, a retriever or a model, and some answers get better while others quietly get worse. An eval measures that: it runs a fixed set of questions through the system and grades every answer, so you compare numbers instead of impressions. This lesson evaluates the RAG pipeline from the previous lesson on 6 questions, with different retrievers and two graders.',
  concept: [
    'A test set is a fixed list of inputs with expected outputs, written by people who know the right answers.',
    'The system under test is the whole pipeline, here: rewrite, retrieve, prompt and answer.',
    'A grader decides if an answer passes. Exact match is strict and simple; "contains" forgives extra words. Real evals also use code checks, people, or another model as the judge.',
    'Change one thing at a time and compare scores. A test set that is too small or too easy can hide problems, and the grader itself can be wrong.',
  ],
  howItWorks: [
    'Fix the test set: questions and expected answers.',
    'Run every question through the system.',
    'Grade each answer with the chosen grader.',
    'Report the score, then change one setting and run again.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'retriever', label: 'Retriever', type: 'choice', sample: defaults.retriever, options: RETRIEVERS, help: 'tfidf, dense (the model\'s embeddings), or none.' },
      { name: 'k', label: 'k (documents)', type: 'number', sample: defaults.k, help: `${K.min} to ${K.max}.` },
      { name: 'grader', label: 'Grader', type: 'choice', sample: defaults.grader, options: GRADERS, help: 'contains: the answer includes the expected text; exact: it is the expected text.' },
    ],
    presets: [
      { label: 'Baseline', values: defaults },
      { label: 'Dense', values: { ...defaults, retriever: 'dense' } },
      { label: 'No retrieval', values: { ...defaults, retriever: 'none' } },
      { label: 'Strict grader', values: { ...defaults, grader: 'exact' } },
      { label: 'k 1', values: { ...defaults, k: '1' } },
    ],
    generate: evalsSteps,
    codeLabel: 'Pseudocode',
  },
  code: evalsCode,
  prosCons: {
    pros: ['Turns "it seems better" into a number you can compare', 'Catches regressions before users do', 'Shows which part of a pipeline fails, case by case'],
    cons: ['Only as good as the test set: it measures what it covers', 'Simple graders reject right answers that are worded differently', 'Model judges are flexible but can be biased or inconsistent'],
    useWhen: ['Before and after every change to a prompt, model, retriever or tool'],
    avoidWhen: ['Never skip it for systems people rely on; at most start with a handful of cases and grow the set'],
  },
  applications: [
    'Teams run eval suites in CI before shipping a prompt or model change',
    'Benchmarks compare models on shared test sets',
    'Production traces of failures become new eval cases',
  ],
  commonMistakes: [
    'Changing several things at once, so a score change cannot be explained.',
    'Trusting exact match: "the bone" fails against "bone" although it is right.',
    'Testing on the same few examples used to write the prompt, which overstates the score.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'With the exact grader, case 1 expects "bone" and the system answers "the bone". Does it pass?',
      view: strictStart.view,
      options: ['No: exact match needs the same text', 'Yes: the answer is right', 'Only if k is 1', 'The grader crashes'],
      answer: 0,
      explanation: 'Exact match compares the whole text, so a right answer worded differently fails. "contains" would pass it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'The score drops from 6/6 to 5/6 when k goes from 2 to 1. What does that tell you?',
      options: ['One answer needed a document that only k = 2 retrieved', 'The model got worse, because k changed its weights', 'The grader is broken, because scores should never drop', 'Nothing'],
      answer: 0,
      explanation: '"What did the dog chase?" needs "the dog chased the ball", which ranks second.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which grader does this line use when grader is "contains"?',
      code: "ok = grader === 'exact' ? got === c.expected : got.includes(c.expected)",
      options: ['The answer passes if it includes the expected text', 'The answer must equal the expected text', 'Every answer passes', 'A model judges it'],
      answer: 0,
      explanation: 'includes() accepts extra words around the expected text.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why change only one setting between eval runs?',
      options: ['So a score change can be traced to that setting', 'Evals only allow one setting', 'To make runs faster', 'It does not matter'],
      answer: 0,
      explanation: 'With one change, the difference in score is that change\'s effect.',
    },
  ],
  summary: [
    'An eval runs a fixed test set through the system and grades each answer.',
    'The score turns changes into numbers you can compare.',
    'Graders can be wrong: exact match rejects right answers worded differently.',
    'Change one thing at a time, and grow the test set from real failures.',
  ],
};

export default content;
