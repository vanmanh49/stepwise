import { describe, expect, it } from 'vitest';
import { getLesson } from '../../lessons/registry';
import { searchIndex, searchTopics, type SearchItem } from './search';

const titles = (query: string) => searchTopics(query, searchIndex).map((item) => item.title);

describe('searchTopics', () => {
  it('returns nothing for an empty query', () => {
    expect(titles('')).toEqual([]);
    expect(titles('   ')).toEqual([]);
  });

  it('puts titles that start with the query first', () => {
    const result = titles('binary');
    expect(result.slice(0, 3).every((t) => t.startsWith('Binary'))).toBe(true);
    expect(result).toEqual(expect.arrayContaining(['Binary Search', 'Binary Search Tree', 'Binary Tree']));
  });

  it('ranks live lessons ahead of planned topics within the same match quality', () => {
    const planned: SearchItem = { id: 'p', title: 'Graph Colouring', category: 'algorithms', keywords: [] };
    const live: SearchItem = { id: 'l', title: 'Graph Search', category: 'algorithms', keywords: [], path: '/algorithms/l' };
    expect(searchTopics('graph', [planned, live]).map((item) => item.id)).toEqual(['l', 'p']);
  });

  it('finds the Binary Search Tree lesson by its old topic name', () => {
    expect(titles('bst operations')).toContain('Binary Search Tree');
  });

  it('is case-insensitive and matches inside titles', () => {
    expect(titles('BFS')).toContain('Breadth-First Search (BFS)');
    expect(titles('bfs')).toContain('Breadth-First Search (BFS)');
    expect(titles('sort')).toEqual(expect.arrayContaining(['Bubble Sort', 'Merge Sort']));
  });

  it('matches keywords when the title does not match', () => {
    expect(titles('fifo')).toContain('Queue');
    expect(titles('lifo')).toContain('Stack');
    expect(titles('pivot')).toContain('Quick Sort');
  });

  it('returns at most 8 results', () => {
    expect(titles('s').length).toBeLessThanOrEqual(8);
    expect(titles('zzzz')).toEqual([]);
  });

  it('gives live lessons a path and planned topics none', () => {
    expect(searchIndex.find((item) => item.id === 'queue')?.path).toBe('/data-structures/queue');
    for (const item of searchIndex) expect(item.path !== undefined, item.id).toBe(getLesson(item.id) !== undefined);
  });
});
