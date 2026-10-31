import type { SessionsView } from '../../../types/visualization';
import { TableRenderer } from './TableRenderer';

const STATUS: Record<SessionsView['rows'][number]['status'], string> = {
  ran: 'ran',
  waiting: 'waits for a lock',
  resumed: 'ran after waiting',
  skipped: 'skipped',
  error: 'error',
  'still waiting': 'still waiting',
  next: '',
};

/** A two-session script as a timeline: one row per statement, in its session's column, then each session's view of the data. */
export function SessionsRenderer({ view }: { view: SessionsView }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] table-fixed border-collapse font-mono text-xs">
          <caption className="sr-only">Statements of sessions A and B in the order they were tried</caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="w-1/2 pb-1 font-semibold">Session A</th>
              <th scope="col" className="w-1/2 pb-1 font-semibold">Session B</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, i) => {
              const cell = (
                <td className="py-1 pr-2 align-top">
                  <div
                    aria-current={row.active ? 'step' : undefined}
                    className={`rounded-md border px-2 py-1 ${row.active ? 'border-accent ring-2 ring-accent' : 'border-border'} ${row.status === 'next' || row.status === 'skipped' ? 'text-muted' : ''}`}
                  >
                    <div className="break-words">{row.text}</div>
                    {(STATUS[row.status] || row.anomaly) && (
                      <div className="mt-0.5 font-sans text-[11px] text-muted">
                        {STATUS[row.status]}
                        {row.anomaly && <strong className="ml-1 text-[color:var(--role-swap-fg)]">· {row.anomaly}</strong>}
                      </div>
                    )}
                  </div>
                </td>
              );
              const empty = <td className="py-1" />;
              return (
                <tr key={i}>
                  {row.session === 'A' ? cell : empty}
                  {row.session === 'B' ? cell : empty}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TableRenderer view={{ kind: 'table', clauses: [], tables: view.tables }} />
    </div>
  );
}
