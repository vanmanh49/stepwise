import { describe, expect, it } from 'vitest';
import type { BucketsView, CallsView, ClusterView, GridView, PanelsView, ServicesView, TrieView } from '../../types/visualization';
import { rolesInRun, rolesInView } from './roles';

describe('rolesInView', () => {
  it('lists the roles in a services view', () => {
    const view: ServicesView = {
      kind: 'services',
      nodes: [
        { id: 'client', label: 'Client', type: 'client', column: 0, role: 'default' },
        { id: 'api', label: 'API', type: 'service', column: 1, role: 'default', instances: [{ id: 'api-1', role: 'active' }, { id: 'api-2', role: 'discarded' }] },
      ],
      links: [{ from: 'client', to: 'api', role: 'frontier' }],
      messages: [{ id: 'm1', from: 'client', to: 'api', label: 'GET / #1', role: 'compare', progress: 0.5 }],
      requests: [
        { id: '#1', label: 'GET /', status: 'ok', hops: 'client' },
        { id: '#2', label: 'GET /', status: 'pending', hops: 'client' },
        { id: '#3', label: 'GET /', status: 'failed', hops: 'client' },
      ],
      log: [],
    };
    expect(rolesInView(view)).toEqual(['default', 'default', 'active', 'discarded', 'frontier', 'compare', 'found', 'discarded']);
  });

  it('lists the roles in a cluster view', () => {
    const view: ClusterView = {
      kind: 'cluster',
      controlPlane: [{ id: 'scheduler', label: 'scheduler', role: 'active' }],
      nodes: [{ name: 'node-1', ready: true, role: 'default', cpu: { used: 1, capacity: 4 }, pods: [{ name: 'web-a', phase: 'Running', ready: true, role: 'found' }] }],
      pending: [{ name: 'web-b', role: 'frontier' }],
      objects: [{ kind: 'Deployment', name: 'web', desired: 2, current: 2, ready: 1, role: 'compare' }],
      requests: [
        { id: '#1', label: 'to web', status: 'ok' },
        { id: '#2', label: 'to web', status: 'failed' },
        { id: '#3', label: 'to web', status: 'pending' },
      ],
      scoring: { pod: 'web-b', rows: [{ node: 'node-1', role: 'found' }, { node: 'node-2', role: 'discarded' }] },
      log: [],
    };
    expect(rolesInView(view)).toEqual(['active', 'default', 'found', 'frontier', 'compare', 'found', 'discarded', 'found', 'discarded']);
  });

  it('lists the roles of a cluster view\'s rule table', () => {
    const view: ClusterView = { kind: 'cluster', controlPlane: [], nodes: [], pending: [], objects: [], rules: { title: 'Ingress rules', columns: ['Host'], rows: [{ cells: ['a'], role: 'found' }, { cells: ['b'], role: 'discarded' }] }, log: [] };
    expect(rolesInView(view)).toEqual(['found', 'discarded']);
  });

  it('collects the roles of every row in a table view', () => {
    const view = {
      kind: 'table' as const,
      clauses: ['FROM'],
      tables: [
        {
          label: 't',
          columns: ['a'],
          rows: [
            { id: '1', cells: [1], role: 'found' as const },
            { id: '2', cells: [null], role: 'discarded' as const },
          ],
        },
      ],
    };
    expect(rolesInView(view)).toEqual(['found', 'discarded']);
    expect(rolesInRun([view])).toEqual(['found', 'discarded']);
  });

  it('collects roles from grid cells and skips gaps', () => {
    const view: GridView = {
      kind: 'grid',
      rows: [{ cells: [{ id: 'a', value: 1, role: 'active' }, null, { id: 'b', value: 2, role: 'sorted' }] }],
    };
    expect(rolesInView(view)).toEqual(['active', 'sorted']);
  });

  it('collects roles from trie nodes', () => {
    const view: TrieView = {
      kind: 'trie',
      nodes: [
        { id: 't:', letter: '', role: 'visited' },
        { id: 't:a', parent: 't:', letter: 'a', word: 'a', role: 'found' },
      ],
    };
    expect(rolesInView(view)).toEqual(['visited', 'found']);
  });

  it('collects roles from call frames in order', () => {
    const view: CallsView = {
      kind: 'calls',
      frames: [
        { id: 'a', label: 'f(2)', role: 'active' },
        { id: 'b', label: 'f(1)', parent: 'a', role: 'sorted', result: '1' },
      ],
    };
    expect(rolesInView(view)).toEqual(['active', 'sorted']);
  });

  it('collects roles from the input row, then the buckets', () => {
    const view: BucketsView = {
      kind: 'buckets',
      input: { label: 'in', cells: [{ id: 'a', value: 1, role: 'active' }] },
      buckets: [{ label: '0', cells: [{ id: 'b', value: 10, role: 'found' }] }, { label: '1', cells: [] }],
    };
    expect(rolesInView(view)).toEqual(['active', 'found']);
  });

  it('collects roles from every panel', () => {
    const view: PanelsView = {
      kind: 'panels',
      panels: [
        { label: 'board', view: { kind: 'grid', rows: [{ cells: [{ id: 'q', value: 'Q', role: 'found' }] }] } },
        { view: { kind: 'calls', frames: [{ id: 'f', label: 'place(0)', role: 'discarded' }, { id: 'g', label: 'x', role: 'default' }] } },
      ],
    };
    expect(rolesInView(view)).toEqual(['found', 'discarded', 'default']);
    expect(rolesInRun([view])).toEqual(['found', 'discarded']);
  });
});
