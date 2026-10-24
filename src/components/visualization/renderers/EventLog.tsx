/** The last few events of a run, newest last and in full colour. */
export function EventLog({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ol aria-label="Recent events" className="space-y-0.5 border-t border-border pt-2 font-mono text-[11px] text-muted">
      {lines.map((line, i) => (
        <li key={`${lines.length}-${i}`} className={i === lines.length - 1 ? 'text-text' : ''}>
          {line}
        </li>
      ))}
    </ol>
  );
}
