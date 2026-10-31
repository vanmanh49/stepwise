import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, Step } from '../../types/visualization';
import { QUESTIONS, type Question } from '../standin';
import { EMPTY, K } from '../steps';
import { RETRIEVERS, runRag } from './rag';

export const evalsCode = `cases = [{ question, expected }, …]   // a fixed test set
passed = 0
for (const c of cases) {
  got = rag(c.question, retriever, k)   // the system under test
  ok = grader === 'exact' ? got === c.expected : got.includes(c.expected)
  if (ok) passed++
}
score = passed / cases.length`;

export const GRADERS = ['contains', 'exact'];
const CASE_IDS = ['dog-ate', 'bird-flew', 'fish-swam', 'cat-likes', 'dog-played', 'dog-chased'];
const CASES: readonly Question[] = CASE_IDS.map((id) => QUESTIONS.find((q) => q.id === id)!);

const line = (snippet: string) => lineOf(evalsCode, snippet);

interface EvalRow {
  question: Question;
  got: string;
  pass: boolean;
}

export function grade(got: string, expected: string, grader: string): boolean {
  const g = got.trim().toLowerCase();
  return grader === 'exact' ? g === expected : g.includes(expected);
}

/** Runs the RAG pipeline on every case and grades each answer. */
export function evaluate(retriever: string, k: number, grader: string): { rows: EvalRow[]; passed: number } {
  const rows = CASES.map((question) => {
    const got = runRag(question, k, retriever).answer.text;
    return { question, got, pass: grade(got, question.expected, grader) };
  });
  return { rows, passed: rows.filter((r) => r.pass).length };
}

function resultsTable(rows: EvalRow[]): GridView {
  return {
    kind: 'grid',
    colLabels: ['question', 'expected', 'got', 'pass'],
    rows: CASES.map((q, i) => {
      const row = rows[i];
      return {
        label: `#${i + 1}`,
        cells: [
          { id: `${q.id}-q`, value: q.text, role: 'default' },
          { id: `${q.id}-expected`, value: q.expected, role: 'default' },
          row ? { id: `${q.id}-got`, value: row.got, role: row.pass ? 'found' : 'discarded' } : null,
          row ? { id: `${q.id}-pass`, value: row.pass ? '✓' : '✗', role: row.pass ? 'found' : 'discarded' } : null,
        ],
      };
    }),
  };
}

export function evalsSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't run this eval", why, EMPTY);
  const retriever = readChoice(values, 'retriever', 'Retriever', RETRIEVERS);
  if (!retriever.ok) return fail(retriever.why);
  const k = readInt(values, 'k', 'k', K);
  if (!k.ok) return fail(k.why);
  const grader = readChoice(values, 'grader', 'Grader', GRADERS);
  if (!grader.ok) return fail(grader.why);

  const { rows, passed } = evaluate(retriever.value, k.value, grader.value);
  const system = retriever.value === 'none' ? 'no retrieval' : `${retriever.value === 'tfidf' ? 'TF-IDF' : 'dense'} retrieval, k = ${k.value}`;
  const steps: Step[] = [
    {
      title: `A test set of ${CASES.length} questions with expected answers`,
      why: `An eval runs a fixed set of cases through the system and grades every answer, so changes can be compared by a number instead of a feeling. The system under test is the RAG pipeline (${system}) with the rule-based stand-in as the model.`,
      codeLine: line('cases = ['),
      view: resultsTable([]),
    },
  ];
  rows.forEach((row, i) => {
    const sofar = rows.slice(0, i + 1);
    const score = sofar.filter((r) => r.pass).length;
    steps.push({
      title: `Case ${i + 1}: got "${row.got}", expected "${row.question.expected}": ${row.pass ? 'pass' : 'fail'}`,
      why: row.pass
        ? grader.value === 'exact' ? 'The answer is exactly the expected text.' : 'The answer contains the expected text.'
        : grader.value === 'exact' && grade(row.got, row.question.expected, 'contains')
          ? 'The answer is right but worded differently, and the exact grader only accepts the same text. Graders can be wrong too.'
          : 'The system got this one wrong: check what was retrieved (try the RAG lesson with this question).',
      codeLine: line('ok = grader'),
      variables: { passed: score, run: sofar.length },
      view: resultsTable(sofar),
    });
  });
  steps.push({
    title: `Score: ${passed} of ${CASES.length} with ${system} and the ${grader.value} grader`,
    why: 'Change one thing at a time (the retriever, k or the grader) and compare the scores. A drop shows what broke; a rise shows what helped.',
    next: 'AI agents are built from these parts: a model that calls tools in a loop, checked by evals like this one.',
    codeLine: line('score = passed / cases.length'),
    variables: { score: `${passed}/${CASES.length}` },
    view: resultsTable(rows),
  });
  return steps;
}
