import { describe, expect, it } from 'vitest';
import { ragSteps } from './rag';

const last = (question: string, k: string, retriever: string) => ragSteps({ question, k, retriever }).at(-1)!;

describe('RAG lesson', () => {
  it('answers from the retrieved document and cites it', () => {
    const title = last('dog-ate', '2', 'tfidf').title;
    expect(title).toContain('"the bone"');
    expect(title).toContain('[doc 12]');
  });

  it('makes up an answer without retrieval', () => {
    const title = last('dog-ate', '2', 'none').title;
    expect(title).toContain('"the mat"');
    expect(title.toLowerCase()).toContain('made up');
  });

  it('needs k = 2 for "What did the dog chase?"', () => {
    expect(last('dog-chased', '1', 'tfidf').title).toContain("don't say");
    expect(last('dog-chased', '2', 'tfidf').title).toContain('"the ball"');
  });

  it('refuses an unknown question with one step', () => {
    expect(ragSteps({ question: 'why', k: '2', retriever: 'tfidf' })).toHaveLength(1);
  });
});
