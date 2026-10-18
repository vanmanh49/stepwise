import type { Graph } from '../../types/lesson';
import type { Role, Step } from '../../types/visualization';
import { edgeKey, graphView, labelOf, neighbours } from './view';

export const sccCode = `function kosaraju(graph: Graph): string[][] {
  const finished: string[] = [], seen = new Set<string>();
  const visit = (v: string) => {
    seen.add(v);
    for (const w of graph.neighbours(v)) if (!seen.has(w)) visit(w);
    finished.push(v); // v finishes after everything it can reach
  };
  for (const v of graph.nodes) if (!seen.has(v)) visit(v);
  const reversed = graph.reverseEdges();
  const components: string[][] = [], assigned = new Set<string>();
  const collect = (v: string, group: string[]) => {
    assigned.add(v);
    group.push(v);
    for (const w of reversed.neighbours(v)) if (!assigned.has(w)) collect(w, group);
  };
  for (const v of finished.reverse()) {
    if (!assigned.has(v)) {
      const group: string[] = [];
      collect(v, group); // everything reached here is one component
      components.push(group);
    }
  }
  return components;
}`;

const LINE = { start: 8, visit: 4, finish: 6, reverse: 9, newGroup: 19, collect: 13, done: 23 };

function reverse(g: Graph): Graph {
  return { ...g, edges: g.edges.map((e) => ({ ...e, from: e.to, to: e.from })) };
}

/** Kosaraju's two passes; components in discovery order. */
function kosaraju(g: Graph): string[][] {
  const finished: string[] = [];
  const seen = new Set<string>();
  const visit = (v: string): void => {
    seen.add(v);
    for (const w of neighbours(g, v)) if (!seen.has(w.id)) visit(w.id);
    finished.push(v);
  };
  for (const v of g.nodes) if (!seen.has(v.id)) visit(v.id);
  const reversed = reverse(g);
  const assigned = new Set<string>();
  const components: string[][] = [];
  const collect = (v: string, group: string[]): void => {
    assigned.add(v);
    group.push(v);
    for (const w of neighbours(reversed, v)) if (!assigned.has(w.id)) collect(w.id, group);
  };
  for (const v of finished.toReversed()) {
    if (assigned.has(v)) continue;
    const group: string[] = [];
    collect(v, group);
    components.push(group);
  }
  return components;
}

/** Each component sorted, components ordered by their first node. */
export function stronglyConnectedComponents(g: Graph): string[][] {
  return kosaraju(g)
    .map((group) => group.toSorted())
    .toSorted((a, b) => a[0]!.localeCompare(b[0]!));
}

export function sccSteps(g: Graph, _start?: string): Step[] {
  const name = (id: string) => labelOf(g, id);
  const reversed = reverse(g);
  const roles: Record<string, Role> = {};
  const edgeRoles: Record<string, Role> = {};
  const finished: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const steps: Step[] = [];
  const pass1View = (extra: Record<string, Role> = {}) =>
    graphView(g, { ...roles, ...extra }, edgeRoles, {
      frontier: { label: 'Finish order', items: finished.map(name) },
    });

  steps.push({
    title: 'Pass 1: depth-first search, recording finish order',
    why: 'Two nodes are strongly connected when each can reach the other. Kosaraju first runs DFS over the whole graph and notes when each node finishes, meaning everything it can reach has been explored.',
    next: `Start a DFS at ${name(g.nodes[0]!.id)}.`,
    codeLine: LINE.start,
    view: pass1View(),
  });

  const visit = (v: string): void => {
    seen.add(v);
    stack.push(v);
    roles[v] = 'active';
    steps.push({
      title: `Visit ${name(v)}`,
      why: stack.length === 1 ? `${name(v)} has not been seen, so a new DFS starts here.` : `Reached ${name(v)} from ${name(stack[stack.length - 2]!)}.`,
      codeLine: LINE.visit,
      variables: { path: stack.map(name).join(' → ') },
      view: pass1View(),
    });
    roles[v] = 'frontier';
    for (const w of neighbours(g, v)) {
      if (seen.has(w.id)) continue;
      edgeRoles[edgeKey(v, w.id)] = 'visited';
      visit(w.id);
    }
    stack.pop();
    finished.push(v);
    roles[v] = 'visited';
    steps.push({
      title: `${name(v)} finishes`,
      why: `Everything reachable from ${name(v)} has been explored, so it is added to the finish order. Nodes that finish later sit "upstream" of the ones that finished earlier.`,
      codeLine: LINE.finish,
      variables: { 'finish order': finished.map(name).join(', ') },
      view: pass1View(),
    });
  };
  for (const v of g.nodes) if (!seen.has(v.id)) visit(v.id);

  const order = finished.toReversed();
  steps.push({
    title: 'Reverse every edge',
    why: `Reversing the edges keeps each strongly connected component intact, but cuts the one-way links between components. Pass 2 takes nodes in reverse finish order: ${order.map(name).join(', ')}.`,
    codeLine: LINE.reverse,
    view: graphView(reversed, {}, {}, { frontier: { label: 'Pass 2 order', items: order.map(name) } }),
  });

  const badges: Record<string, string> = {};
  const passRoles: Record<string, Role> = {};
  let count = 0;
  const pass2View = () => graphView(reversed, { ...passRoles }, {}, { badges: { ...badges } });
  const collect = (v: string, label: string): void => {
    badges[v] = label;
    passRoles[v] = 'found';
    steps.push({
      title: `${name(v)} joins ${label}`,
      why: `In the reversed graph ${name(v)} is reachable from the component’s first node, and in pass 1 it was downstream of it, so the two reach each other.`,
      codeLine: LINE.collect,
      view: pass2View(),
    });
    for (const w of neighbours(reversed, v)) if (badges[w.id] === undefined) collect(w.id, label);
  };
  for (const v of order) {
    if (badges[v] !== undefined) continue;
    count++;
    const label = `C${count}`;
    passRoles[v] = 'pivot';
    steps.push({
      title: `Start component ${label} at ${name(v)}`,
      why: `${name(v)} is the next node in reverse finish order without a component. A DFS from it in the reversed graph collects exactly its component, because the edges to other unassigned components now point the wrong way.`,
      codeLine: LINE.newGroup,
      view: pass2View(),
    });
    collect(v, label);
  }

  const components = kosaraju(g);
  steps.push({
    title: `${components.length} strongly connected component${components.length === 1 ? '' : 's'}`,
    why: components.map((c, i) => `C${i + 1}: ${c.map(name).join(', ')}`).join('. ') + '. Within a component every node can reach every other.',
    codeLine: LINE.done,
    view: graphView(g, Object.fromEntries(g.nodes.map((n) => [n.id, 'found' as Role])), {}, { badges }),
  });
  return steps;
}
