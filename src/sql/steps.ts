import type { SqlRow, SqlTable, Step, TableView } from '../types/visualization';
import { LOGICAL_ORDER, type Clause, type SelectStatement } from './ast';
import type { Dataset } from './datasets';
import { asSqlError, type SqlError } from './errors';
import { executeSelect, type QueryResult, type Relation, type TraceEvent } from './execute';
import { parseQuery } from './parse';
import { formatValue, toPlain, type Truth } from './values';

export const MAX_STEPS = 400;
/** Row checks shown per clause before the rest are summarised, when a run would be too long. */
const FIRST_CHECKS = 12;

export type StepsResult = { ok: true; steps: Step[]; result: QueryResult } | { ok: false; error: SqlError };

const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`;
const word = (outcome: Truth) => (outcome === null ? 'unknown' : String(outcome));

function columnNames(relation: Relation): string[] {
  // Qualify names only when columns come from more than one table.
  const qualify = new Set(relation.columns.flatMap((c) => (c.table ? [c.table] : []))).size > 1;
  return relation.columns.map((c) => (qualify && c.table ? `${c.table}.${c.name}` : c.name));
}

export function toTable(label: string, relation: Relation, decorate: (id: string, index: number) => Partial<SqlRow> = () => ({})): SqlTable {
  return {
    label,
    columns: columnNames(relation),
    rows: relation.rows.map((row, i) => ({ id: row.id, cells: row.values.map(toPlain), role: 'default', ...decorate(row.id, i) })),
  };
}

/** Column indexes whose names appear among the values a condition read. */
export function focusOf(relation: Relation, values: Record<string, string>): number[] {
  const keys = Object.keys(values).map((k) => k.toLowerCase());
  return relation.columns.flatMap((c, i) =>
    keys.includes(c.name.toLowerCase()) || (c.table && keys.includes(`${c.table}.${c.name}`.toLowerCase())) ? [i] : [],
  );
}

export interface Draft {
  step: Omit<Step, 'view'>;
  /** Built only for steps that survive summarising: a long run must not copy the table thousands of times. */
  view: () => TableView;
  /** Row checks of one clause share a group, so long runs can be summarised. */
  group?: string;
  kept?: boolean;
  /** Never dropped when a long run is cut to fit, such as a script's statement headers. */
  pinned?: boolean;
}

export function buildDrafts(stmt: SelectStatement, events: TraceEvent[]): Draft[] {
  // A compound shows its SELECTs and operators in the order they are written.
  const clauses: Clause[] = stmt.compound?.length
    ? [
        'SELECT',
        ...stmt.compound.flatMap((c): Clause[] => [c.op, 'SELECT']),
        ...(stmt.orderBy.length > 0 ? (['ORDER BY'] as const) : []),
        ...(stmt.limit ? (['LIMIT'] as const) : []),
      ]
    : LOGICAL_ORDER.filter((c) => stmt.lines[c] !== undefined);
  if (stmt.with) clauses.unshift('WITH');
  const usesWindow = events.some((e) => e.kind === 'window-partitions');
  if (usesWindow) clauses.splice(clauses.indexOf('SELECT'), 0, 'WINDOW');
  const cteLine = (name: string) => stmt.with?.find((c) => c.name.toLowerCase() === name.toLowerCase())?.line ?? 1;
  const recursed = new Set<string>();
  const lineOf = (clause: Clause, fallback?: number) => stmt.lines[clause] ?? fallback ?? stmt.lines.SELECT ?? 1;
  const view = (current: Clause | undefined, tables: SqlTable[]): TableView => ({
    kind: 'table',
    clauses,
    ...(current && { current }),
    tables,
  });
  const drafts: Draft[] = [];
  const push = (
    clause: Clause | undefined,
    step: Omit<Step, 'view' | 'codeLine'>,
    tables: () => SqlTable[],
    extra: Partial<Draft> = {},
    line?: number,
  ) => drafts.push({ step: { ...step, codeLine: line ?? lineOf(clause ?? 'SELECT') }, view: () => view(clause, tables()), ...extra });

  let fromLabel = '';
  let workingLabel = '';
  let lastScan = '';
  let scans = 0;
  let combines = 0;
  const tableNames = [stmt.from?.table, ...stmt.joins.map((j) => j.table)].flatMap((t) => (t ? [t.toLowerCase()] : []));
  const repeated = new Set(tableNames.filter((t, i) => tableNames.indexOf(t) !== i));
  let joinIndex = -1;
  let joinLeft: Relation | undefined;
  // Checks of the current clause in order; each step's view reads the checks made so far.
  let tested: [id: string, outcome: Truth][] = [];
  let lastRelation: Relation | undefined;

  if (!stmt.from) {
    push(undefined, {
      title: 'Run the query',
      why: `Without FROM, the query works on a single row with no columns. Clauses run in this order: ${clauses.join(' → ')}.`,
    }, () => []);
  }

  for (const event of events) {
    switch (event.kind) {
      case 'scan': {
        // A table that appears more than once (a self join) is labelled by alias: "e (employees)".
        const ref = scans === 0 ? stmt.from : stmt.joins[scans - 1];
        scans++;
        const label = ref?.alias && repeated.has(ref.table.toLowerCase()) ? `${ref.alias} (${event.table})` : event.table;
        lastScan = label;
        if (scans > 1) break; // a JOIN's table; its pairs show it
        fromLabel = workingLabel = label;
        lastRelation = event.relation;
        push(undefined, {
          title: 'Run the query',
          why: `SQL runs the clauses in this order: ${clauses.join(' → ')}.`,
          next: 'FROM picks the table to read.',
        }, () => [toTable(label, event.relation)]);
        push('FROM', {
          title: `FROM ${event.table}: start with all ${rows(event.relation.rows.length)}`,
          why: 'FROM picks the table the query reads. Every later clause works on these rows.',
        }, () => [toTable(label, event.relation)]);
        break;
      }

      case 'window-partitions': {
        const group = new Map(event.partitions.flatMap((ids, p) => ids.map((id) => [id, p + 1] as const)));
        const n = event.partitions.length;
        push('WINDOW', {
          title: event.label ? `WINDOW: ${n} ${n === 1 ? 'partition' : 'partitions'} by ${event.label}` : 'WINDOW: all rows form one partition',
          why: 'A window function looks at rows near each row without merging them. PARTITION BY splits the rows into groups, and ORDER BY sorts each group.',
        }, () => [toTable(workingLabel, event.input, (id) => ({ group: group.get(id)! }))], {}, lineOf('SELECT'));
        break;
      }

      case 'window-row': {
        const depends = new Set(event.dependsOn);
        const shown = event.values.map((v) => formatValue(v));
        push('WINDOW', {
          title: `${event.partition}, row ${event.position}: ${event.fn} = ${shown[0]}${event.detail ? `, ${event.detail}` : ''}`,
          why: 'The value is worked out from this row and the rows marked next to it, within its partition. The row itself stays in the result.',
          variables: Object.fromEntries(event.columns.map((c, i) => [c, shown[i]!])),
        }, () => [
          toTable(workingLabel, event.relation, (id) => (id === event.row ? { role: 'active', focus: [event.relation.columns.length - event.columns.length] } : depends.has(id) ? { role: 'compare' } : {})),
        ], { group: 'WINDOW', kept: true }, lineOf('SELECT'));
        break;
      }

      case 'cte': {
        if (recursed.has(event.name)) break; // its rounds already showed it
        push('WITH', {
          title: `WITH ${event.name}: ${rows(event.relation.rows.length)}`,
          why: `The WITH query runs first. Its result works like a table called ${event.name} for the rest of the query.`,
        }, () => [toTable(event.name, event.relation)], {}, cteLine(event.name));
        break;
      }

      case 'recursion-round': {
        recursed.add(event.name);
        const read = new Set(event.read.rows.map((r) => r.id));
        const added = new Set(event.added.rows.map((r) => r.id));
        const nameColumn = Math.max(0, event.total.columns.findIndex((c) => c.name.toLowerCase() === 'name'));
        const names = event.added.rows.map((r) => formatValue(r.values[nameColumn]!));
        const n = event.added.rows.length;
        const done = event.round > 0 && n === 0;
        const title =
          event.round === 0
            ? `Start: ${rows(n)}${n > 0 && n <= 3 ? ` (${names.join(', ')})` : ''}`
            : done
              ? `Round ${event.round} finds nothing, so the recursion stops`
              : `Round ${event.round}: ${n} new ${n === 1 ? 'row' : 'rows'}, reached from the ${rows(event.read.rows.length)} found ${event.round === 1 ? 'at the start' : `in round ${event.round - 1}`}`;
        const why =
          event.round === 0
            ? 'The first SELECT (the anchor) runs once. Its rows start the result.'
            : done
              ? 'The recursive SELECT found no new rows from the last round, so nothing more can be reached.'
              : `The recursive SELECT runs again, but reads only the rows found in the previous round as ${event.name}. Its new rows join the result.`;
        push('WITH', { title, why }, () => [
          toTable(event.name, event.total, (id) => (added.has(id) ? { role: 'found' } : read.has(id) ? { role: 'compare' } : {})),
        ], done ? {} : { group: `ROUNDS-${event.name}`, kept: true }, cteLine(event.name));
        break;
      }

      case 'compound-side': {
        const n = stmt.compound!.length + 1;
        const name = event.index === 0 ? 'Left SELECT' : n === 2 ? 'Right SELECT' : `SELECT ${event.index + 1}`;
        const line = event.index === 0 ? lineOf('SELECT') : stmt.compound![event.index - 1]!.selectLine;
        if (event.index === 0) {
          push(undefined, {
            title: 'Run the query',
            why: `Each SELECT runs on its own first. Then their rows are combined from left to right: ${clauses.join(' → ')}.`,
          }, () => [], {}, line);
        }
        push('SELECT', {
          title: `${name}: ${rows(event.relation.rows.length)}`,
          why: event.index === 0 ? 'The first SELECT runs as a normal query.' : 'The next SELECT runs on its own, with the same number of columns.',
        }, () => [toTable(name, event.relation)], {}, line);
        break;
      }

      case 'combined': {
        combines++;
        const part = stmt.compound![combines - 1]!;
        const dropped = Object.values(event.notes).filter((n) => n === 'duplicate, dropped').length;
        const role = (note?: string) =>
          note === undefined ? {} : ({ role: note === 'kept' || note === 'in both' ? 'found' : 'discarded', note } as Partial<SqlRow>);
        const title = {
          UNION: `UNION: ${rows(event.relation.rows.length)}, ${dropped} ${dropped === 1 ? 'duplicate' : 'duplicates'} dropped`,
          'UNION ALL': `UNION ALL: all ${rows(event.relation.rows.length)} kept`,
          INTERSECT: `INTERSECT: ${rows(event.relation.rows.length)} in both`,
          EXCEPT: `EXCEPT: ${rows(event.relation.rows.length)} left after removing those on the right`,
        }[event.op];
        const why = {
          UNION: 'UNION puts the rows of both sides together and keeps one copy of each repeated row.',
          'UNION ALL': 'UNION ALL puts the rows of both sides together and keeps every row, repeats included.',
          INTERSECT: 'INTERSECT keeps the rows that appear on both sides, once each.',
          EXCEPT: 'EXCEPT keeps the rows of the left side that do not appear on the right, once each.',
        }[event.op];
        lastRelation = event.relation;
        push(event.op, { title, why }, () => [
          toTable(combines === 1 ? 'left' : 'result so far', event.left, (id) => role(event.notes[id])),
          toTable('right', event.right, (id) => role(event.notes[id])),
          toTable('combined', event.relation, () => ({ role: 'found' })),
        ], {}, part.line);
        break;
      }

      case 'case-row': {
        const i = event.input.rows.findIndex((r) => r.id === event.row);
        const shown = typeof event.value === 'string' ? `'${event.value}'` : formatValue(event.value);
        const read = Object.entries(event.values).map(([k, v]) => `${k} ${v}`).join(', ');
        const focus = focusOf(event.input, event.values);
        push('SELECT', {
          title: `Row ${i + 1}: ${read ? `${read} → ` : ''}${event.branch} → ${shown}`,
          why: 'CASE tries its WHEN conditions in order and uses the first one that is true. If none is, it uses ELSE, or NULL when there is no ELSE.',
        }, () => [toTable(workingLabel, event.input, (id) => (id === event.row ? { role: 'active', note: shown, ...(focus.length > 0 && { focus }) } : {}))], {
          group: 'CASE',
          kept: true,
        });
        break;
      }

      case 'join-test': {
        if (joinLeft !== event.left) {
          joinIndex++;
          joinLeft = event.left;
        }
        const leftLabel = joinIndex === 0 ? fromLabel : 'joined rows';
        const i = event.left.rows.findIndex((r) => r.id === event.leftRow);
        const j = event.right.rows.findIndex((r) => r.id === event.rightRow);
        const kept = event.outcome === true;
        push('JOIN', {
          title: `${leftLabel} row ${i + 1} with ${lastScan} row ${j + 1}: ${event.join.on.text} → ${word(event.outcome)}`,
          why:
            event.outcome === null
              ? 'A comparison with NULL is unknown, and JOIN only keeps pairs where the condition is true.'
              : kept
                ? 'The ON condition is true, so this pair becomes a row of the result.'
                : 'The ON condition is false, so this pair is skipped.',
        }, () => [
          toTable(leftLabel, event.left, (id) => (id === event.leftRow ? { role: 'active' } : {})),
          toTable(lastScan, event.right, (id) => (id === event.rightRow ? { role: kept ? 'found' : 'discarded' } : {})),
        ], { group: `JOIN${joinIndex}`, kept }, event.join.line);
        break;
      }

      case 'join-unmatched': {
        const left = joinLeft ?? lastRelation!;
        const leftLabel = joinIndex <= 0 ? fromLabel : 'joined rows';
        const i = left.rows.findIndex((r) => r.id === event.leftRow);
        push('JOIN', {
          title: `No match for row ${i + 1}, so LEFT JOIN keeps it with NULLs`,
          why: "LEFT JOIN keeps every row of the left table. Where nothing matched, the right table's columns are NULL.",
        }, () => [toTable(leftLabel, left, (id) => (id === event.leftRow ? { role: 'found', note: 'no match' } : {}))], {
          group: `JOIN${joinIndex}`,
          kept: true,
        }, event.join.line);
        break;
      }

      case 'joined':
        workingLabel = 'after JOIN';
        lastRelation = event.relation;
        joinLeft = undefined;
        push('JOIN', {
          title: `JOIN result: ${rows(event.relation.rows.length)}`,
          why: 'Each matching pair became one row holding the columns of both tables.',
        }, () => [toTable('after JOIN', event.relation)], {}, event.join.line);
        break;

      case 'filter-test': {
        tested.push([event.row, event.outcome]);
        const checked = tested;
        const count = tested.length;
        const i = event.input.rows.findIndex((r) => r.id === event.row);
        const kept = event.outcome === true;
        const label = event.clause === 'WHERE' ? workingLabel : 'groups';
        const focus = focusOf(event.input, event.values);
        push(event.clause, {
          title: `Row ${i + 1}: ${(event.clause === 'WHERE' ? stmt.where! : stmt.having!).text} → ${word(event.outcome)}`,
          why:
            event.outcome === null
              ? `A comparison with NULL is unknown, and ${event.clause} only keeps rows where the condition is true.`
              : kept
                ? `The condition is true, so ${event.clause} keeps this row.`
                : `The condition is false, so ${event.clause} removes this row.`,
          variables: event.values,
        }, () => {
          const outcomes = new Map(checked.slice(0, count));
          return [
            toTable(label, event.input, (id) => {
              if (!outcomes.has(id)) return {};
              const ok = outcomes.get(id) === true;
              return { role: ok ? 'found' : 'discarded', note: ok ? 'kept' : 'removed', ...(id === event.row && focus.length > 0 && { focus }) };
            }),
          ];
        }, { group: event.clause, kept });
        break;
      }

      case 'filtered': {
        const before = tested.length;
        tested = [];
        lastRelation = event.relation;
        if (event.clause === 'WHERE') workingLabel = 'after WHERE';
        push(event.clause, {
          title: `${event.clause} kept ${event.relation.rows.length} of ${rows(before)}`,
          why: 'Only the rows where the condition was true move on to the next clause.',
        }, () => [toTable(`after ${event.clause}`, event.relation)]);
        break;
      }

      case 'grouped': {
        const byId = new Map(event.input.rows.map((r) => [r.id, r]));
        const ordered: Relation = {
          columns: event.input.columns,
          rows: event.groups.flatMap((g) => g.rowIds.map((id) => byId.get(id)!)),
        };
        const groupOf = new Map(event.groups.flatMap((g, n) => g.rowIds.map((id) => [id, n + 1] as const)));
        push('GROUP BY', {
          title: `GROUP BY sorted rows into ${event.groups.length} ${event.groups.length === 1 ? 'group' : 'groups'}`,
          why: `Rows with the same ${event.relation.columns.map((c) => c.name).join(', ')} go into the same group.`,
        }, () => [toTable(workingLabel, ordered, (id) => ({ group: groupOf.get(id)! }))]);
        push('GROUP BY', {
          title: 'Each group becomes one row',
          why: 'From here on each group is one row. Columns outside GROUP BY can only be read through an aggregate such as COUNT or MAX.',
        }, () => [toTable('groups', event.relation)]);
        lastRelation = event.relation;
        break;
      }

      case 'projected':
        lastRelation = event.relation;
        push('SELECT', {
          title: `SELECT picks the columns ${event.relation.columns.map((c) => c.name).join(', ')}`,
          why: 'SELECT computes each output column for every remaining row.',
        }, () => [toTable('after SELECT', event.relation)]);
        break;

      case 'distinct': {
        const removed = new Set(event.removed);
        lastRelation = event.relation;
        push('DISTINCT', {
          title: `DISTINCT removed ${event.removed.length} duplicate ${event.removed.length === 1 ? 'row' : 'rows'}`,
          why: 'DISTINCT keeps the first copy of each identical row.',
        }, () => [toTable('after SELECT', event.input, (id) => (removed.has(id) ? { role: 'discarded', note: 'duplicate' } : {}))]);
        break;
      }

      case 'sorted':
        lastRelation = event.relation;
        push('ORDER BY', {
          title: `ORDER BY sorted the rows by ${stmt.orderBy.map((o) => o.expr.text + (o.desc ? ' DESC' : '')).join(', ')}`,
          why:
            stmt.orderBy.length > 1
              ? 'Rows are compared by the first key; ties are broken by the next key.'
              : 'Rows are arranged by the key. In SQLite, NULL comes first when sorting ascending.',
        }, () => [toTable('after ORDER BY', event.relation, () => ({ role: 'sorted' }))]);
        break;

      case 'limited': {
        const { count, offset } = stmt.limit!;
        const kept = new Set(event.relation.rows.map((r) => r.id));
        lastRelation = event.relation;
        push('LIMIT', {
          title: `LIMIT kept ${event.relation.rows.length} of ${rows(event.input.rows.length)}`,
          why: `LIMIT ${count}${offset ? ` OFFSET ${offset}` : ''} keeps up to ${rows(count)}${offset ? ` after skipping ${offset}` : ''}.`,
        }, () => [toTable('before LIMIT', event.input, (id) => (kept.has(id) ? {} : { role: 'discarded', note: 'cut' }))]);
        break;
      }
    }
  }

  const result = lastRelation!;
  push(undefined, {
    title: `Result: ${rows(result.rows.length)}`,
    why: 'This is what the query returns.',
  }, () => [toTable('result', result, () => ({ role: 'found' }))]);
  return drafts;
}

/** Keeps the first `limit` checks of each clause and replaces the rest with one summary draft. */
function summarise(drafts: Draft[], limit: number): Draft[] {
  const out: Draft[] = [];
  let seen = 0;
  let skipped: Draft[] = [];
  const flush = () => {
    if (skipped.length === 0) return;
    const last = skipped.at(-1)!;
    out.push({
      step: {
        title: `…${skipped.length} more rows checked, ${skipped.filter((d) => d.kept).length} kept`,
        why: 'These checks follow the same rule, so they are combined to keep the run short.',
        codeLine: last.step.codeLine,
      },
      view: last.view,
    });
    skipped = [];
  };
  drafts.forEach((draft, i) => {
    const previous = drafts[i - 1]?.group;
    if (draft.group !== previous) {
      flush();
      seen = 0;
    }
    if (draft.group !== undefined && seen++ >= limit) skipped.push(draft);
    else out.push(draft);
  });
  flush();
  return out;
}

/** Chooses the drafts to show within MAX_STEPS, then builds only their views. */
export function fit(drafts: Draft[]): Step[] {
  const build = (kept: Draft[]) => kept.map((d) => ({ ...d.step, view: d.view() }));
  if (drafts.length <= MAX_STEPS) return build(drafts);
  for (let limit = FIRST_CHECKS; ; limit = Math.max(1, Math.floor(limit / 2))) {
    const kept = summarise(drafts, limit);
    if (kept.length <= MAX_STEPS) return build(kept);
    if (limit === 1) {
      // Last resort: keep pinned drafts and the final one, and fill the rest from the start.
      const must = new Set([...kept.filter((d) => d.pinned), kept.at(-1)!]);
      let room = MAX_STEPS - must.size;
      return build(kept.filter((d) => must.has(d) || (room-- > 0)));
    }
  }
}

/** Runs a query and describes it as steps, one clause at a time. Never throws. */
export function querySteps(db: Dataset, sql: string): StepsResult {
  const parsed = parseQuery(sql);
  if (!parsed.ok) return parsed;
  try {
    const events: TraceEvent[] = [];
    const result = executeSelect(db, parsed.statement, (e) => events.push(e));
    return { ok: true, steps: fit(buildDrafts(parsed.statement, events)), result };
  } catch (error) {
    return { ok: false, error: asSqlError(error) };
  }
}

/** A step's view, for lesson quizzes. A negative index counts from the end. Throws if the query fails. */
export function viewAt(db: Dataset, sql: string, index: number): TableView {
  const result = querySteps(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} in: ${sql}`);
  const step = result.steps.at(index);
  if (!step) throw new Error(`No step ${index} in: ${sql}`);
  return step.view as TableView;
}
