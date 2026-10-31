import { VECTOR_KINDS, vectorSearchCode, vectorSearchSteps } from '../../ai/scenarios/vector-search';
import type { LessonContent } from '../../types/lesson';

const defaults = { query: 'dog park', k: '3', vectors: 'dense' };

// "dog ate" with dense vectors, scores computed: the learner predicts which sentence comes first.
const denseVerb = vectorSearchSteps({ ...defaults, query: 'dog ate' }).at(-2)!;

const content: LessonContent = {
  overview:
    'To answer from your own documents, an app first has to find the right ones. Vector search turns the query and every document into vectors and ranks the documents by cosine similarity. This lesson searches the 30 toy sentences two ways: with the tiny model\'s own embeddings (dense) and with word counts (TF-IDF, sparse), and shows where each one fails.',
  concept: [
    'Every document is turned into a vector once and stored. A query is turned into a vector the same way, and compared with all of them.',
    'Dense vectors come from a model: here, the average of the tiny model\'s word embeddings, leaving out filler words such as "the".',
    'Sparse vectors (TF-IDF) have one number per vocabulary word: how often it appears, times how rare it is across the documents.',
    'The tiny model\'s embeddings were trained to predict the next word, not to find sentences, so they mix up verbs. Real systems use encoders trained for retrieval, and indexes that find near neighbours without checking every document.',
  ],
  howItWorks: [
    'Turn the query into a vector (dense: average the content words\' embeddings; TF-IDF: weigh each word by its rarity).',
    'Turn each document into a vector the same way.',
    'Score every document with cosine similarity to the query.',
    'Sort by score and keep the top k.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'query', label: 'Query', type: 'text', sample: defaults.query, help: '1 to 6 words from the toy corpus.' },
      { name: 'k', label: 'k (results)', type: 'number', sample: defaults.k, help: '1 to 5.' },
      { name: 'vectors', label: 'Vectors', type: 'choice', sample: defaults.vectors, options: VECTOR_KINDS, help: 'dense: the model\'s embeddings; tfidf: word counts.' },
    ],
    presets: [
      { label: 'Dog park', values: defaults },
      { label: 'Fish pond', values: { ...defaults, query: 'fish pond' } },
      { label: 'Dog ate (dense fails)', values: { ...defaults, query: 'dog ate' } },
      { label: 'Dog ate (TF-IDF)', values: { ...defaults, query: 'dog ate', vectors: 'tfidf' } },
    ],
    generate: vectorSearchSteps,
    codeLabel: 'Pseudocode',
  },
  code: vectorSearchCode,
  prosCons: {
    pros: ['Finds documents by meaning (dense) or by exact words (sparse)', 'Document vectors are computed once and reused for every query', 'Scores give a ranking, so the app can take as many results as fit'],
    cons: ['Dense vectors are only as good as the model that made them', 'Sparse vectors miss synonyms: "puppy" will not match "dog"', 'Checking every document gets slow for millions of them, so real systems need an index'],
    useWhen: ['Finding passages for RAG, semantic search, or deduplicating similar texts'],
    avoidWhen: ['Exact lookups by id or filter, which a database does better'],
  },
  applications: [
    'Vector databases store millions of embeddings with approximate nearest-neighbour indexes',
    'Hybrid search combines dense and keyword (sparse) scores',
    'Recommendation systems find items whose vectors are close to what a user liked',
  ],
  commonMistakes: [
    'Using embeddings from a model that was not trained for search, as this toy does, and trusting the ranking.',
    'Embedding the query and the documents with different models: their vectors are not comparable.',
    'Forgetting to normalise vectors, so long documents win just by being long.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Dense vectors have scored every sentence for "dog ate". Which sentence comes out on top?',
      view: denseVerb.view,
      options: ['the cat chased the bird', 'the dog ate the bone', 'the dog sat on the rug', 'a dog is in the park'],
      answer: 0,
      explanation: 'The tiny model\'s embeddings mix up verbs and animals, so a wrong sentence wins. TF-IDF puts "the dog ate the bone" first.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does TF-IDF give "ate" more weight than "the"?',
      options: ['"ate" is in few documents, "the" in almost all', '"ate" is a longer word', '"the" is not in the vocabulary', 'Verbs always get double weight'],
      answer: 0,
      explanation: 'The weight is count × log(N ÷ documents containing the word), so rare words count more.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What does this line compute for each document?',
      code: 'scores = docs.map((d) => cosine(q, embed(d)))   // compare with every document',
      options: ['How closely its vector points the same way as the query\'s', 'How many words it has, counted one by one', 'Its position in the corpus, from first to last', 'The next word'],
      answer: 0,
      explanation: 'Cosine similarity is 1 for the same direction and 0 for nothing in common.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What would make the dense search work well?',
      options: ['An encoder model trained for retrieval', 'A higher temperature', 'More filler words', 'Fewer documents'],
      answer: 0,
      explanation: 'Retrieval encoders are trained so that questions and their answers get close vectors.',
    },
  ],
  summary: [
    'Vector search ranks documents by cosine similarity to the query.',
    'Dense vectors come from a model; sparse TF-IDF vectors from word counts.',
    'Dense vectors are only as good as their model: this toy\'s mix up verbs.',
    'Real systems use retrieval encoders, indexes, and often both kinds together.',
  ],
};

export default content;
