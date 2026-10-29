import { describe, expect, it } from 'vitest';
import { evaluate, evalsSteps } from './evals';
import { RETRIEVERS } from './rag';

describe('evals lesson', () => {
  it('scores the baseline 6/6', () => {
    expect(evaluate('tfidf', 2, 'contains').passed).toBe(6);
  });

  it('scores 4/6 with the strict grader', () => {
    expect(evaluate('tfidf', 2, 'exact').passed).toBe(4);
  });

  it('loses "What did the dog chase?" at k = 1', () => {
    const run = evaluate('tfidf', 1, 'contains');
    expect(run.passed).toBe(5);
    expect(run.rows.find((r) => !r.pass)!.question.id).toBe('dog-chased');
  });

  it('scores dense retrieval below the baseline, and no retrieval at 0', () => {
    expect(evaluate('dense', 2, 'contains').passed).toBeLessThan(6);
    expect(evaluate('none', 2, 'contains').passed).toBe(0);
  });

  it('never scores exact above contains', () => {
    for (const r of RETRIEVERS) for (let k = 1; k <= 5; k++) expect(evaluate(r, k, 'exact').passed).toBeLessThanOrEqual(evaluate(r, k, 'contains').passed);
  });

  it('ends with the score', () => {
    const last = evalsSteps({ retriever: 'tfidf', k: '2', grader: 'exact' }).at(-1)!;
    expect(last.title).toContain('4 of 6');
    expect(last.variables).toMatchObject({ score: '4/6' });
  });
});
