import { describe, expect, it } from 'vitest';
import type { Step, TrieView } from '../types/visualization';
import { pick, rng } from './random.testutil';
import { MAX_WORDS, trieStructure, trieView } from './trie';

function run(opId: string, state: string[], word: string) {
  const op = trieStructure.ops.find((o) => o.id === opId)!;
  return op.run(state, [], [word]);
}

const last = (steps: Step[]) => steps.at(-1)!;
const nodesOf = (steps: Step[]) => (last(steps).view as TrieView).nodes;

describe('trie view', () => {
  it('has one node per distinct prefix plus the root, marking word ends', () => {
    const view = trieView(['car', 'cart', 'cat']);
    expect(view.nodes.map((n) => n.id)).toEqual(['t:', 't:c', 't:ca', 't:car', 't:cart', 't:cat']);
    expect(view.nodes.filter((n) => n.word).map((n) => n.word)).toEqual(['car', 'cart', 'cat']);
    expect(view.nodes.find((n) => n.id === 't:ca')!.parent).toBe('t:c');
  });
});

describe('trie', () => {
  it('creates exactly the missing nodes, one step per letter', () => {
    const { steps, state } = run('insert', ['car', 'cat'], 'card');
    expect(steps.filter((s) => s.title.startsWith('Follow'))).toHaveLength(3);
    expect(steps.filter((s) => s.title.startsWith('Create'))).toHaveLength(1);
    expect(state).toEqual(['car', 'card', 'cat']);
    expect(nodesOf(steps)).toHaveLength(6);
  });

  it('says a stored word is already there', () => {
    const { steps, state } = run('insert', ['car'], 'car');
    expect(last(steps).title).toContain('already');
    expect(state).toEqual(['car']);
  });

  it('tells a prefix from a word when searching', () => {
    expect(last(run('search', ['cart'], 'car').steps).title).toBe('"car" is a prefix, not a stored word');
    expect(last(run('search', ['cart'], 'cart').steps).title).toBe('Found "cart"');
    expect(last(run('search', ['cart'], 'cab').steps).title).toBe('No node for "b": "cab" is not stored');
  });

  it('answers starts with', () => {
    expect(last(run('prefix', ['cart'], 'ca').steps).title).toBe('Some word starts with "ca"');
    expect(last(run('prefix', ['cart'], 'do').steps).title).toBe('No word starts with "do"');
  });

  it('keeps nodes another word needs when deleting', () => {
    const { steps, state } = run('delete', ['car', 'cart'], 'car');
    expect(state).toEqual(['cart']);
    expect(steps.filter((s) => s.title.startsWith('Prune'))).toHaveLength(0);
    expect(nodesOf(steps)).toHaveLength(5);
  });

  it('prunes nodes only the deleted word used', () => {
    const { steps, state } = run('delete', ['car', 'cart'], 'cart');
    expect(state).toEqual(['car']);
    expect(steps.filter((s) => s.title.startsWith('Prune'))).toHaveLength(1);
  });

  it('leaves only the root after deleting the last word', () => {
    const { steps, state } = run('delete', ['cat'], 'cat');
    expect(state).toEqual([]);
    expect(nodesOf(steps).map((n) => n.id)).toEqual(['t:']);
    expect(last(run('search', [], 'cat').steps).title).toContain('not stored');
  });

  it('refuses an 11th word', () => {
    const full = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(full).toHaveLength(MAX_WORDS);
    const result = run('insert', full, 'k');
    expect(result.steps).toHaveLength(1);
    expect(result.state).toBe(full);
  });

  it('matches a Set over random operations and never keeps a node no word needs', () => {
    const r = rng(11);
    const words = ['a', 'an', 'ant', 'and', 'cat', 'car', 'cart', 'do', 'dog', 'dot', 'zebra'];
    let state = trieStructure.initial;
    const reference = new Set(state);
    for (let i = 0; i < 200; i++) {
      const word = pick(r, words);
      const op = pick(r, ['insert', 'insert', 'delete', 'search', 'prefix']);
      const { steps, state: next } = run(op, state, word);
      if (op === 'insert' && reference.size < MAX_WORDS) reference.add(word);
      if (op === 'delete') reference.delete(word);
      state = next;
      expect(new Set(state)).toEqual(reference);
      const nodes = nodesOf(steps);
      for (const node of nodes) {
        if (node.parent === undefined) continue;
        const hasChild = nodes.some((n) => n.parent === node.id);
        expect(hasChild || node.word !== undefined, node.id).toBe(true);
      }
    }
  });
});
