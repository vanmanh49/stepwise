import { indexesOf, type Dataset } from '../../sql/datasets';
import { columnNotes } from '../../sql/schema';

const PEEK_ROWS = 5;

/** The dataset's tables and columns, each with a peek at its first rows. */
export function SchemaPanel({ dataset }: { dataset: Dataset }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Tables in the {dataset.title.toLowerCase()} database</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {dataset.tables.map((table) => (
          <details key={table.name} className="rounded-xl border border-border bg-surface-2/50 px-3 py-2">
            <summary className="cursor-pointer font-mono text-sm font-semibold">
              {table.name} <span className="font-sans font-normal text-muted">· {table.rows.length} rows</span>
            </summary>
            <p className="mt-2 font-mono text-xs leading-relaxed text-muted">
              {table.columns
                .map((c, i) => {
                  const note = columnNotes(table)[i];
                  return `${c.name} ${c.type}${note ? ` (${note})` : ''}`;
                })
                .join(', ')}
            </p>
            {indexesOf(dataset, table.name).length > 0 && (
              <ul aria-label={`Indexes on ${table.name}`} className="mt-1 font-mono text-xs leading-relaxed text-muted">
                {indexesOf(dataset, table.name).map((index) => (
                  <li key={index.name}>
                    {index.implicit
                      ? `${index.unique ? 'UNIQUE ' : ''}${index.columns.join(', ')} (automatic index)`
                      : `${index.unique ? 'UNIQUE ' : ''}index ${index.name} (${index.columns.join(', ')})`}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <caption className="sr-only">First {PEEK_ROWS} rows of {table.name}</caption>
                <thead>
                  <tr className="text-left text-muted">
                    {table.columns.map((c) => (
                      <th key={c.name} scope="col" className="whitespace-nowrap py-1 pr-3 font-medium">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, PEEK_ROWS).map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {row.map((cell, j) => (
                        <td key={j} className="whitespace-nowrap py-1 pr-3">
                          {cell === null ? <span className="italic text-muted">NULL</span> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
      {(dataset.views ?? []).length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Views</span>
          {dataset.views!.map((view) => (
            <p key={view.name} className="rounded-xl border border-border bg-surface-2/50 px-3 py-2 font-mono text-xs">
              <span className="font-semibold">{view.name}</span>
              <span className="text-muted"> AS {view.sql}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
