import type { SqlRow, SqlTable, Step, TableView } from '../types/visualization';
import { LOGICAL_ORDER, type Clause, type SelectStatement } from './ast';
import type { Dataset } from './datasets';
import { SqlError } from './errors';
import { executeSelect, type QueryResult, type Relation, type TraceEvent } from './execute';
import { parseQuery } from './parse';
import { toPlain, type Truth } from './values';

export const MAX_STEPS = 400;
/** Row checks shown per clause before the rest are summarised, when a run would be too long. */
const FIRST_CHECKS = 12;

export type StepsResult = { ok: true; steps: Step[]; result: QueryResult } | { ok: false; error: SqlError };

const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`;
const word = (outcome: Truth) => (outcome === null ? 'unknown' : String(outcome));

function columnNames(relation: Relation): string[] {
  const qualify = new Set(relation.columns.map((c) => c.table)).size > 1;
  return relation.columns.map((c) => (qualify && c.table ? `${c.table}.${c.name}` : c.name));
}

function toTable(label: string, relation: Relation, decorate: (id: string, index: number) => Partial<SqlRow> = () => ({})): SqlTable {
  return {
    label,
    columns: columnNames(relation),
    rows: relation.rows.map((row, i) => ({ id: row.id, cells: row.values.map(toPlain), role: 'default', ...decorate(row.id, i) })),
  };
}

/** Column indexes whose names appear among the values a condition read. */
function focusOf(relation: Relation, values: Record<string, string>): number[] {
  const keys = Object.keys(values).map((k) => k.toLowerCase());
  return relation.columns.flatMap((c, i) =>
    keys.includes(c.name.toLowerCase()) || (c.table && keys.includes(`${c.table}.${c.name}`.toLowerCase())) ? [i] : [],
  );
}

interface Draft {
  step: Step;
  /** Row checks of one clause share a group, so long runs can be summarised. */
  group?: string;
  kept?: boolean;
}

function buildDrafts(stmt: SelectStatement, events: TraceEvent[]): Draft[] {
  const clauses = LOGICAL_ORDER.filter((c) => stmt.lines[c] !== undefined);
  const lineOf = (clause: Clause, fallback?: number) => stmt.lines[clause] ?? fallback ?? stmt.lines.SELECT ?? 1;
  const view = (current: Clause | undefined, tables: SqlTable[]): TableView => ({
    kind: 'table',
    clauses,
    ...(current && { current }),
    tables,
  });
  const drafts: Draft[] = [];
  const push = (clause: Clause | undefined, step: Omit<Step, 'view' | 'codeLine'>, tables: SqlTable[], extra: Partial<Draft> = {}, line?: number) =>
    drafts.push({ step: { ...step, codeLine: line ?? lineOf(clause ?? 'SELECT'), view: view(clause, tables) }, ...extra });

  let fromLabel = '';
  let workingLabel = '';
  let lastScan = '';
  let joinIndex = -1;
  let joinLeft: Relation | undefined;
  let outcomes = new Map<string, Truth>();
  let lastRelation: Relation | undefined;

  for (const event of events) {
    switch (event.kind) {
      case 'scan':
        lastScan = event.table;
        if (drafts.length > 0) break; // a JOIN's table; its pairs show it
        fromLabel = workingLabel = event.table;
        lastRelation = event.relation;
        push(undefined, {
          title: 'Run the query',
          why: `SQL runs the clauses in this order: ${clauses.join(' → ')}.`,
          next: 'FROM picks the table to read.',
        }, [toTable(event.table, event.relation)]);
        push('FROM', {
          title: `FROM ${event.table}: start with all ${rows(event.relation.rows.length)}`,
          why: 'FROM picks the table the query reads. Every later clause works on these rows.',
        }, [toTable(event.table, event.relation)]);
        break;

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
        }, [
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
        }, [toTable(leftLabel, left, (id) => (id === event.leftRow ? { role: 'found', note: 'no match' } : {}))], {
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
        }, [toTable('after JOIN', event.relation)], {}, event.join.line);
        break;

      case 'filter-test': {
        outcomes.set(event.row, event.outcome);
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
        }, [
          toTable(label, event.input, (id) => {
            if (!outcomes.has(id)) return {};
            const ok = outcomes.get(id) === true;
            return { role: ok ? 'found' : 'discarded', note: ok ? 'kept' : 'removed', ...(id === event.row && focus.length > 0 && { focus }) };
          }),
        ], { group: event.clause, kept });
        break;
      }

      case 'filtered': {
        const before = outcomes.size;
        outcomes = new Map();
        lastRelation = event.relation;
        if (event.clause === 'WHERE') workingLabel = 'after WHERE';
        push(event.clause, {
          title: `${event.clause} kept ${event.relation.rows.length} of ${rows(before)}`,
          why: 'Only the rows where the condition was true move on to the next clause.',
        }, [toTable(`after ${event.clause}`, event.relation)]);
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
          why: `Rows with the same ${stmt.groupBy.map((g) => g.text).join(', ')} go into the same group.`,
        }, [toTable(workingLabel, ordered, (id) => ({ group: groupOf.get(id)! }))]);
        push('GROUP BY', {
          title: 'Each group becomes one row',
          why: 'From here on each group is one row. Columns outside GROUP BY can only be read through an aggregate such as COUNT or MAX.',
        }, [toTable('groups', event.relation)]);
        lastRelation = event.relation;
        break;
      }

      case 'projected':
        lastRelation = event.relation;
        push('SELECT', {
          title: `SELECT picks the columns ${event.relation.columns.map((c) => c.name).join(', ')}`,
          why: 'SELECT computes each output column for every remaining row.',
        }, [toTable('after SELECT', event.relation)]);
        break;

      case 'distinct': {
        const removed = new Set(event.removed);
        lastRelation = event.relation;
        push('DISTINCT', {
          title: `DISTINCT removed ${event.removed.length} duplicate ${event.removed.length === 1 ? 'row' : 'rows'}`,
          why: 'DISTINCT keeps the first copy of each identical row.',
        }, [toTable('after SELECT', event.input, (id) => (removed.has(id) ? { role: 'discarded', note: 'duplicate' } : {}))]);
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
        }, [toTable('after ORDER BY', event.relation, () => ({ role: 'sorted' }))]);
        break;

      case 'limited': {
        const { count, offset } = stmt.limit!;
        const kept = new Set(event.relation.rows.map((r) => r.id));
        lastRelation = event.relation;
        push('LIMIT', {
          title: `LIMIT kept ${event.relation.rows.length} of ${rows(event.input.rows.length)}`,
          why: `LIMIT ${count}${offset ? ` OFFSET ${offset}` : ''} keeps up to ${rows(count)}${offset ? ` after skipping ${offset}` : ''}.`,
        }, [toTable('before LIMIT', event.input, (id) => (kept.has(id) ? {} : { role: 'discarded', note: 'cut' }))]);
        break;
      }
    }
  }

  const result = lastRelation!;
  push(undefined, {
    title: `Result: ${rows(result.rows.length)}`,
    why: 'This is what the query returns.',
  }, [toTable('result', result, () => ({ role: 'found' }))]);
  return drafts;
}

/** Keeps the first `limit` checks of each clause and replaces the rest with one summary step. */
function summarise(drafts: Draft[], limit: number): Step[] {
  const out: Step[] = [];
  let seen = 0;
  let skipped: Draft[] = [];
  const flush = () => {
    if (skipped.length === 0) return;
    const last = skipped.at(-1)!.step;
    out.push({
      title: `…${skipped.length} more rows checked, ${skipped.filter((d) => d.kept).length} kept`,
      why: 'These checks follow the same rule, so they are combined to keep the run short.',
      codeLine: last.codeLine,
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
    else out.push(draft.step);
  });
  flush();
  return out;
}

function fit(drafts: Draft[]): Step[] {
  if (drafts.length <= MAX_STEPS) return drafts.map((d) => d.step);
  for (let limit = FIRST_CHECKS; ; limit = Math.max(1, Math.floor(limit / 2))) {
    const steps = summarise(drafts, limit);
    if (steps.length <= MAX_STEPS) return steps;
    if (limit === 1) return [...steps.slice(0, MAX_STEPS - 1), steps.at(-1)!];
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
    if (error instanceof SqlError) return { ok: false, error };
    throw error;
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
