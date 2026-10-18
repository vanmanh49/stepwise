import { describe, expect, it } from 'vitest';
import type { TrieView } from '../../../types/visualization';
import { layoutCalls } from './callsLayout';

describe('trie layout', () => {
  it('places a trie with the n-ary tree layout: leaves in columns, parents centred, y by depth', () => {
    const nodes: TrieView['nodes'] = [
      { id: 't:', letter: '', role: 'default' },
      { id: 't:c', parent: 't:', letter: 'c', role: 'default' },
      { id: 't:ca', parent: 't:c', letter: 'a', word: 'ca', role: 'default' },
      { id: 't:d', parent: 't:', letter: 'd', role: 'default' },
    ];
    expect(layoutCalls(nodes)).toEqual([
      { id: 't:', x: 0.5, y: 0 },
      { id: 't:c', x: 0, y: 1 },
      { id: 't:ca', x: 0, y: 2 },
      { id: 't:d', x: 1, y: 1 },
    ]);
  });
});
