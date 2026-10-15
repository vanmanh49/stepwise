import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { SqlRow, SqlTable, TableView } from '../../../types/visualization';
import { ROLE_META, roleBorder, roleFill, roleText } from '../roles';
import { spring } from './ValueBox';

// Literal class names so Tailwind can see them.
const COLUMNS: Record<number, string> = { 1: '', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' };

function ClauseStrip({ clauses, current }: { clauses: string[]; current?: string }) {
  return (
    <ol aria-label="Clauses in running order" className="flex flex-wrap items-center gap-1.5">
      {clauses.map((clause, i) => {
        const active = clause === current;
        return (
          <li key={clause} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-muted">
                →
              </span>
            )}
            <span
              aria-current={active ? 'step' : undefined}
              className={`rounded-md border px-2 py-1 font-mono text-xs font-semibold ${
                active ? 'border-accent bg-accent text-accent-fg' : 'border-border text-muted'
              }`}
            >
              {clause}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function rowStyle(row: SqlRow): CSSProperties {
  if (row.role !== 'default') return { background: roleFill(row.role), color: roleText(row.role) };
  if (row.group !== undefined) return { background: row.group % 2 === 1 ? 'var(--surface-2)' : 'var(--surface)' };
  return {};
}

function markStyle(row: SqlRow): CSSProperties {
  const { cue } = ROLE_META[row.role];
  return {
    borderLeftWidth: cue === 'double' ? 6 : 4,
    borderLeftStyle: cue === 'dashed' ? 'dashed' : cue === 'double' ? 'double' : 'solid',
    borderLeftColor: row.role === 'default' ? 'transparent' : roleBorder(row.role),
  };
}

function Value({ value }: { value: number | string | null }) {
  if (value === null) return <span className="italic opacity-70">NULL</span>;
  return <>{value}</>;
}

function Table({ table }: { table: SqlTable }) {
  const hasNotes = table.rows.some((r) => r.note);
  const hasGroups = table.rows.some((r) => r.group !== undefined);
  return (
    <figure className="card min-w-0 p-3">
      <figcaption className="eyebrow mb-2">{table.label}</figcaption>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-1 font-mono text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="w-7 px-1 font-medium">
                <span className="sr-only">State</span>
              </th>
              {table.columns.map((column, i) => (
                <th key={i} scope="col" className="whitespace-nowrap px-2 py-1 font-medium">
                  {column}
                </th>
              ))}
              {hasNotes && (
                <th scope="col" className="px-2 py-1 font-medium">
                  <span className="sr-only">Note</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 && (
              <tr>
                <td colSpan={table.columns.length + 2} className="px-2 py-3 text-center text-muted">
                  No rows
                </td>
              </tr>
            )}
            {table.rows.map((row) => {
              const meta = ROLE_META[row.role];
              return (
                <motion.tr key={row.id} layout="position" transition={spring} style={rowStyle(row)} className="transition-colors duration-200">
                  <td className="rounded-l-md px-1 text-center" style={markStyle(row)}>
                    {row.role !== 'default' && (
                      <>
                        <span aria-hidden>{meta.mark}</span>
                        <span className="sr-only">{meta.label}</span>
                      </>
                    )}
                    {row.role === 'default' && hasGroups && row.group !== undefined && (
                      <span className="text-[10px] text-muted">G{row.group}</span>
                    )}
                  </td>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className="whitespace-nowrap px-2 py-1.5"
                      style={row.focus?.includes(i) ? { outline: '2px solid var(--accent)', outlineOffset: -2 } : undefined}
                    >
                      <Value value={cell} />
                    </td>
                  ))}
                  {hasNotes && <td className="whitespace-nowrap rounded-r-md px-2 py-1.5 font-sans text-xs opacity-85">{row.note}</td>}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function TableRenderer({ view }: { view: TableView }) {
  return (
    <div className="flex w-full flex-col gap-4">
      <ClauseStrip clauses={view.clauses} current={view.current} />
      <div className={`grid gap-4 ${COLUMNS[view.tables.length] ?? 'lg:grid-cols-3'}`}>
        {view.tables.map((table, i) => (
          <Table key={`${i}-${table.label}`} table={table} />
        ))}
      </div>
    </div>
  );
}
