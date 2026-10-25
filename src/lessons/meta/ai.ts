import type { LessonMeta } from '../../types/lesson';

/** AI lessons in learning order: what pages need without loading a lesson. */
export const aiMeta: LessonMeta[] = [
  {
    id: 'tokenization',
    title: 'Tokenization (BPE)',
    category: 'ai',
    difficulty: 'beginner',
    group: 'How LLMs Work',
    description: 'Cut your own text into tokens with byte-pair encoding, one learned merge at a time.',
    keywords: ['tokenizer', 'token', 'bpe', 'byte-pair encoding', 'merge', 'vocabulary', 'llm'],
    prerequisites: [],
  },
  {
    id: 'embeddings',
    title: 'Embeddings & Similarity',
    category: 'ai',
    difficulty: 'beginner',
    group: 'How LLMs Work',
    description: 'Look up the tiny model\'s word vectors and measure how alike two words are with cosine similarity.',
    keywords: ['embedding', 'vector', 'cosine similarity', 'dot product', 'word vectors', 'tied embeddings'],
    prerequisites: ['tokenization'],
  },
];
