import { readChoice, refusal } from '../algorithms/form';
import type { FormField } from '../types/lesson';
import type { ArrayView, GridView, LadderView, Role, ServicesView, Step, View } from '../types/visualization';
import { changeCost, type ChangeCost } from './diff';
import { MAX_CALLS, type Trace, type TraceApi, traceRun } from './trace';

export const MAX_STEPS = 200;
export const EMPTY: ArrayView = { kind: 'array', cells: [] };
export const DESIGNS = ['Naive', 'Pattern'] as const;

const NONE = 'None';
const NAIVE_HEADING = '// Naive';
const PATTERN_HEADING = '// With the pattern';
const LADDER_ROWS = 12;
const CHANGED_LINES = 12;
const MAX_COLUMN = 5;
/** Room left after the call steps: a cut notice, the result and the two change steps. */
const TAIL_STEPS = 4;

export interface Design {
  source: string;
  classes: readonly unknown[];
}

export interface Outcome {
  ok: boolean;
  title: string;
  why: string;
  facts: [label: string, value: string][];
}

export interface PatternLesson {
  designs: { naive: Design; pattern: Design; naiveChanged: Design; patternChanged: Design };
  /** The change request's option text, e.g. 'Add Push'. */
  change: string;
  scenario: { name: string; label: string; options: string[]; help?: string; afterChangeOnly?: string[]; patternOnly?: string[] };
  run(choice: { pattern: boolean; changed: boolean }, scenario: string, t: TraceApi): Outcome;
  /** 'Class.method' → the step's why text. */
  notes?: Record<string, string>;
}

/** The code panel: both "before" designs, the naive one first, so code lines work for either. */
export function patternCode(lesson: PatternLesson): string {
  return `${NAIVE_HEADING}\n${lesson.designs.naive.source.trimEnd()}\n\n${PATTERN_HEADING}\n${lesson.designs.pattern.source.trimEnd()}`;
}

export function patternFields(lesson: PatternLesson): FormField[] {
  const { name, label, options, help } = lesson.scenario;
  return [
    { name: 'design', label: 'Design', type: 'choice', sample: DESIGNS[0], options: [...DESIGNS], help: 'Run the plain version, or the one built with the pattern.' },
    { name: 'change', label: 'Change request', type: 'choice', sample: NONE, options: [NONE, lesson.change], help: 'Make this change to the code first, and measure what it costs.' },
    { name, label, type: 'choice', sample: options[0]!, options, ...(help && { help }) },
  ];
}

const allowed = (lesson: PatternLesson, pattern: boolean, changed: boolean) => (option: string) =>
  (changed || !lesson.scenario.afterChangeOnly?.includes(option)) && (pattern || !lesson.scenario.patternOnly?.includes(option));

export function patternPresets(lesson: PatternLesson): { label: string; values: Record<string, string> }[] {
  const { name, options, afterChangeOnly = [] } = lesson.scenario;
  return [
    ['Naive', false, false],
    ['Pattern', true, false],
    ['Naive + change', false, true],
    ['Pattern + change', true, true],
  ].map(([label, pattern, changed]) => {
    const ok = allowed(lesson, pattern as boolean, changed as boolean);
    // A changed preset shows off what the change adds, when that option can run here.
    const pick = (changed && afterChangeOnly.find(ok)) || options.find(ok) || options[0]!;
    return {
      label: label as string,
      values: { design: pattern ? 'Pattern' : 'Naive', change: changed ? lesson.change : NONE, [name]: pick },
    };
  });
}

/** The 1-based line of `method` inside `className`, searched only in the section of the design that ran. */
function methodLine(lines: string[], from: number, to: number, className: string, method: string): number | undefined {
  const head = new RegExp(`\\bclass ${className}\\b`);
  const call = new RegExp(`\\b${method}\\(`);
  const start = lines.findIndex((l, i) => i >= from && i < to && head.test(l));
  if (start < 0) return undefined;
  for (let i = start + 1; i < to && lines[i] !== '}'; i++) if (call.test(lines[i]!)) return i + 1;
  return undefined;
}

interface Drawn {
  rows: LadderView['rows'];
  columns: Map<string, number>;
  order: string[];
}

function sequence<R>(trace: Trace<R>, upTo: number): Drawn {
  const rows: LadderView['rows'] = [];
  const columns = new Map<string, number>([['client', 0]]);
  const order = ['client'];
  const place = (id: string, column: number) => {
    if (columns.has(id)) return;
    columns.set(id, Math.min(MAX_COLUMN, column));
    order.push(id);
  };
  for (const o of trace.objects) if (o.origin.kind === 'harness' && o.firstEvent <= upTo) place(o.id, 1);
  trace.events.slice(0, upTo + 1).forEach((event, e) => {
    const call = trace.calls[event.call]!;
    const role: Role = e === upTo ? 'active' : 'default';
    if (event.kind === 'call') {
      place(call.callee, (columns.get(call.caller) ?? 0) + 1);
      const self = call.caller === call.callee ? '↻ ' : '';
      rows.push({ id: `call-${call.index}`, from: call.caller, to: call.callee, label: `${self}${call.method}(${call.args})`, role });
    } else if (call.returned !== undefined || call.threw !== undefined) {
      const made = trace.objects.find((o) => o.origin.kind === 'made' && o.origin.by === call.index);
      if (made) place(made.id, (columns.get(call.callee) ?? 0) + 1);
      const label = call.threw === undefined ? `→ ${call.returned}` : `throws ${call.threw}`;
      rows.push({ id: `return-${call.index}`, from: call.callee, to: call.caller, label, role: call.threw === undefined ? role : 'discarded' });
    }
  });
  // Objects seen only as arguments still get a place.
  for (const o of trace.objects) if (o.firstEvent <= upTo) place(o.id, 1);
  return { rows, columns, order };
}

function ladderView(drawn: Drawn): LadderView {
  const { rows, order } = drawn;
  return {
    kind: 'ladder',
    columns: order.map((id) => ({ id, label: id })),
    rows: rows.slice(-LADDER_ROWS),
    ...(rows.length > LADDER_ROWS ? { earlier: rows.length - LADDER_ROWS } : {}),
  };
}

function objectsView<R>(trace: Trace<R>, drawn: Drawn, acting?: string): ServicesView {
  const shown = new Set(drawn.order);
  const links = new Map<string, ServicesView['links'][number]>();
  for (const r of trace.references) {
    if (shown.has(r.from) && shown.has(r.to)) links.set(`${r.from}>${r.to}`, { from: r.from, to: r.to, role: 'default' });
  }
  return {
    kind: 'services',
    nodes: drawn.order.map((id) => ({
      id,
      label: id,
      type: id === 'client' ? 'client' : 'service',
      column: drawn.columns.get(id)!,
      role: id === acting ? 'active' : 'default',
    })),
    links: [...links.values()],
    messages: [],
    requests: [],
    log: [],
  };
}

const panels = (...list: [string, Exclude<View, { kind: 'panels' }>][]): View => ({ kind: 'panels', panels: list.map(([label, view]) => ({ label, view })) });

function costGrid(naive: ChangeCost, pattern: ChangeCost): GridView {
  const rows: [string, (c: ChangeCost) => number, (c: ChangeCost) => string | number][] = [
    ['Classes added', (c) => c.classesAdded.length, (c) => c.classesAdded.length],
    ['Classes edited', (c) => c.classesEdited.length, (c) => c.classesEdited.length],
    ['Lines +', (c) => c.linesAdded, (c) => c.linesAdded],
    ['Lines −', (c) => c.linesRemoved, (c) => c.linesRemoved],
    ['Branches', (c) => c.branchesAfter, (c) => `${c.branchesBefore} → ${c.branchesAfter}`],
  ];
  return {
    kind: 'grid',
    colLabels: ['Naive', 'Pattern'],
    rows: rows.map(([label, score, value], r) => {
      const [a, b] = [score(naive), score(pattern)];
      const role = (mine: number, other: number): Role => (mine === other ? 'default' : mine < other ? 'found' : 'compare');
      return {
        label,
        cells: [
          { id: `cost-${r}-naive`, value: value(naive), role: role(a, b) },
          { id: `cost-${r}-pattern`, value: value(pattern), role: role(b, a) },
        ],
      };
    }),
  };
}

function linesGrid(cost: ChangeCost): GridView {
  const shown = cost.lines.slice(0, CHANGED_LINES);
  const rows: GridView['rows'] = shown.map((l, i) => ({
    label: l.sign === '+' ? '+' : '−',
    cells: [{ id: `line-${i}`, value: `${l.className}: ${l.text}`, role: l.sign === '+' ? 'found' : 'discarded' }],
  }));
  if (cost.lines.length > shown.length) rows.push({ cells: [{ id: 'line-more', value: `… ${cost.lines.length - shown.length} more`, role: 'default' }] });
  if (rows.length === 0) rows.push({ cells: [{ id: 'line-none', value: 'No lines changed', role: 'default' }] });
  return { kind: 'grid', rows };
}

const summary = (c: ChangeCost) =>
  `${c.classesAdded.length} ${c.classesAdded.length === 1 ? 'class' : 'classes'} added, ${c.classesEdited.length} edited, ${c.linesAdded} lines added and ${c.linesRemoved} removed`;

/** Runs the chosen design on the scenario and turns its trace into steps: calls, the result, then what the change cost. */
export function patternSteps(lesson: PatternLesson, values: Record<string, string>): Step[] {
  const { scenario } = lesson;
  const design = readChoice(values, 'design', 'Design', DESIGNS);
  if (!design.ok) return refusal('Choose a design', design.why, EMPTY);
  const change = readChoice(values, 'change', 'Change request', [NONE, lesson.change]);
  if (!change.ok) return refusal('Choose a change request', change.why, EMPTY);
  const picked = readChoice(values, scenario.name, scenario.label, scenario.options);
  if (!picked.ok) return refusal(`Choose a value for ${scenario.label}`, picked.why, EMPTY);
  const pattern = design.value === 'Pattern';
  const changed = change.value !== NONE;
  if (!changed && scenario.afterChangeOnly?.includes(picked.value)) {
    return refusal(`${picked.value} needs the change first`, `${picked.value} exists only after the change "${lesson.change}". Set Change request to it, then run again.`, EMPTY);
  }
  if (!pattern && scenario.patternOnly?.includes(picked.value)) {
    return refusal(`${picked.value} needs the pattern`, `The naive design fixes this inside its classes, so it has no way to run "${picked.value}". Set Design to Pattern.`, EMPTY);
  }

  const { designs } = lesson;
  const chosen = pattern ? (changed ? designs.patternChanged : designs.pattern) : changed ? designs.naiveChanged : designs.naive;
  const trace = traceRun(chosen.classes, (t) => lesson.run({ pattern, changed }, picked.value, t));
  const code = patternCode(lesson).split('\n');
  const split = code.indexOf(PATTERN_HEADING);
  const [from, to] = pattern ? [split + 1, code.length] : [0, split];
  const variables = { design: design.value, change: change.value };

  const steps: Step[] = [];
  let line: number | undefined;
  trace.events.forEach((event, e) => {
    const call = trace.calls[event.call]!;
    if (event.kind === 'return' && call.returned === undefined && call.threw === undefined) return;
    if (event.kind === 'call') line = methodLine(code, from, to, call.className, call.method);
    const drawn = sequence(trace, e);
    const isCall = event.kind === 'call';
    steps.push({
      title: isCall
        ? `${call.caller} calls ${call.callee}.${call.method}(${call.args})`
        : call.threw === undefined
          ? `${call.callee} returns ${call.returned}`
          : `${call.callee} throws: ${call.threw}`,
      why: isCall
        ? (lesson.notes?.[`${call.className}.${call.method}`] ?? `${call.caller} needs ${call.callee} to ${call.method}.`)
        : `${call.callee} hands the answer back to ${call.caller}.`,
      ...(isCall && line !== undefined ? { codeLine: line } : {}),
      variables,
      view: panels(['Sequence', ladderView(drawn)], ['Objects', objectsView(trace, drawn, call.callee)]),
    });
  });
  const cut = steps.length - (MAX_STEPS - TAIL_STEPS);
  if (cut > 0) {
    steps.length = MAX_STEPS - TAIL_STEPS;
    steps.push({ title: `${cut} more steps skipped`, why: 'The run made more calls than fit, so the middle is left out.', variables, view: steps.at(-1)!.view });
  }

  const final = sequence(trace, trace.events.length - 1);
  const outcome: Outcome = trace.capped
    ? { ok: false, title: `The run was cut at ${MAX_CALLS} calls`, why: 'The design kept calling without finishing, so the run stopped.', facts: [['Calls', String(MAX_CALLS)]] }
    : trace.error !== undefined || !trace.result
      ? { ok: false, title: `The run failed: ${trace.error ?? 'no result'}`, why: 'The design threw an error before it finished.', facts: [['Error', trace.error ?? 'no result']] }
      : trace.result;
  const role: Role = outcome.ok ? 'found' : 'discarded';
  steps.push({
    title: outcome.title,
    why: outcome.why,
    variables: { ...variables, result: outcome.ok ? 'right' : 'wrong' },
    view: panels(
      ['Sequence', { ...ladderView(final), rows: ladderView(final).rows.map((r) => ({ ...r, role: r.role === 'active' ? 'default' : r.role })) }],
      ['Result', { kind: 'grid', rows: outcome.facts.map(([label, value], i) => ({ label, cells: [{ id: `fact-${i}`, value, role }] })) }],
    ),
  });

  if (changed) {
    const naiveCost = changeCost(designs.naive.source, designs.naiveChanged.source);
    const patternCost = changeCost(designs.pattern.source, designs.patternChanged.source);
    const mine = pattern ? patternCost : naiveCost;
    steps.push({
      title: `What "${lesson.change}" cost`,
      why: `Naive: ${summary(naiveCost)}. Pattern: ${summary(patternCost)}.`,
      variables,
      view: costGrid(naiveCost, patternCost),
    });
    steps.push({
      title: `The lines the ${pattern ? 'pattern' : 'naive'} design changed`,
      why: `${mine.lines.length} ${mine.lines.length === 1 ? 'line' : 'lines'} changed: + is added, − is removed.`,
      variables,
      view: linesGrid(mine),
    });
  }
  return steps;
}
