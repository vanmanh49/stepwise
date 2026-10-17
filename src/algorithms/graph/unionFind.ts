import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, labelOf } from './view';

export const unionFindCode = `function find(x: string): string {
  if (parent[x] !== x) parent[x] = find(parent[x]); // path compression
  return parent[x];
}

function union(a: string, b: string): boolean {
  let ra = find(a), rb = find(b);
  if (ra === rb) return false; // same group: this edge closes a cycle
  if (rank[ra] < rank[rb]) [ra, rb] = [rb, ra];
  parent[rb] = ra; // hang the shorter tree under the taller one
  if (rank[ra] === rank[rb]) rank[ra]++;
  return true;
}

function countComponents(graph: Graph): number {
  for (const v of graph.nodes) { parent[v] = v; rank[v] = 0; }
  for (const { from, to } of graph.edges) union(from, to);
  return new Set(graph.nodes.map(find)).size;
}`;

const LINE = { init: 16, edge: 17, find: 7, cycle: 8, union: 10, count: 18 };

/** Disjoint set with union by rank and path compression. */
function makeSets(ids: string[]) {
  const parent: Record<string, string> = Object.fromEntries(ids.map((id) => [id, id]));
  const rank: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const find = (x: string): string => {
    if (parent[x] !== x) parent[x] = find(parent[x]!);
    return parent[x]!;
  };
  const union = (a: string, b: string): { merged: boolean; root: string; child: string } => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return { merged: false, root: ra, child: rb };
    if (rank[ra]! < rank[rb]!) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    if (rank[ra] === rank[rb]) rank[ra]!++;
    return { merged: true, root: ra, child: rb };
  };
  return { parent, rank, find, union };
}

export function unionFindComponents(g: Graph): { components: number; cycleEdges: [string, string][] } {
  const ids = g.nodes.map((n) => n.id);
  const sets = makeSets(ids);
  const cycleEdges: [string, string][] = [];
  for (const edge of g.edges) {
    if (!sets.union(edge.from, edge.to).merged) cycleEdges.push([edge.from, edge.to]);
  }
  return { components: new Set(ids.map(sets.find)).size, cycleEdges };
}

export function unionFindSteps(g: Graph, _start?: string): Step[] {
  const ids = g.nodes.map((n) => n.id);
  const name = (id: string) => labelOf(g, id);
  const sets = makeSets(ids);
  const edgeRoles: Record<string, Role> = {};
  const view = (nodeRoles: Record<string, Role> = {}, extraEdges: Record<string, Role> = {}) =>
    graphView(g, nodeRoles, { ...edgeRoles, ...extraEdges }, {
      // Badges show the root each node currently points at, without compressing anything.
      badges: Object.fromEntries(ids.map((id) => [id, name(rootOf(id))])),
      table: {
        columns: ['parent', 'rank'],
        rows: Object.fromEntries(ids.map((id) => [name(id), [name(sets.parent[id]!), String(sets.rank[id])]])),
      },
    });
  const rootOf = (id: string) => {
    let x = id;
    while (sets.parent[x] !== x) x = sets.parent[x]!;
    return x;
  };

  const steps: Step[] = [
    {
      title: 'Every node starts in a group of its own',
      why: 'Each node is its own parent, so each is the root of a one-node group. The badge above a node shows its group’s root.',
      next: 'Go through the edges one by one.',
      codeLine: LINE.init,
      view: view(),
    },
  ];

  for (const edge of g.edges) {
    const key = edgeKey(edge.from, edge.to);
    const a = name(edge.from);
    const b = name(edge.to);
    const ra = sets.find(edge.from);
    const rb = sets.find(edge.to);
    steps.push({
      title: `Edge ${a}–${b}: find both roots`,
      why: `Following parent links, ${a} leads to root ${name(ra)} and ${b} leads to root ${name(rb)}. Along the way every visited node is pointed straight at its root (path compression), so the next lookup is shorter.`,
      codeLine: LINE.find,
      variables: { [`root(${a})`]: name(ra), [`root(${b})`]: name(rb) },
      view: view({ [edge.from]: 'active', [edge.to]: 'active', [ra]: 'pivot', [rb]: 'pivot' }, { [key]: 'active' }),
    });
    const result = sets.union(edge.from, edge.to);
    if (result.merged) {
      edgeRoles[key] = 'sorted';
      steps.push({
        title: `Join the groups of ${name(result.child)} and ${name(result.root)}`,
        why: `The roots differ, so ${a} and ${b} were not yet connected. Root ${name(result.child)} now points at ${name(result.root)}; the shorter tree goes under the taller one (union by rank) so trees stay flat.`,
        codeLine: LINE.union,
        variables: { [`parent[${name(result.child)}]`]: name(result.root), [`rank[${name(result.root)}]`]: sets.rank[result.root]! },
        view: view({ [result.root]: 'found', [result.child]: 'visited' }),
      });
    } else {
      edgeRoles[key] = 'discarded';
      steps.push({
        title: `${a}–${b} closes a cycle`,
        why: `${a} and ${b} already share root ${name(ra)}, so they were connected before this edge. Adding it would create a loop.`,
        codeLine: LINE.cycle,
        view: view({ [edge.from]: 'discarded', [edge.to]: 'discarded' }),
      });
    }
  }

  for (const id of ids) sets.find(id);
  const roots = [...new Set(ids.map(sets.find))];
  const cycles = Object.values(edgeRoles).filter((r) => r === 'discarded').length;
  steps.push({
    title: `${roots.length} connected component${roots.length === 1 ? '' : 's'}`,
    why: `A final find on every node points each one straight at its root. Distinct roots are distinct components: ${roots.map(name).join(', ')}. ${
      cycles === 0 ? 'No edge closed a cycle.' : `${cycles} edge${cycles === 1 ? '' : 's'} closed a cycle.`
    }`,
    codeLine: LINE.count,
    variables: { components: roots.length },
    view: view(Object.fromEntries(roots.map((r) => [r, 'found' as Role]))),
  });
  return steps;
}
