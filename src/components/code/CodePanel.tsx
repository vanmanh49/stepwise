import { useEffect, useMemo, useRef, type ReactNode } from 'react';

const TOKEN =
  /(\/\/.*$)|('[^']*'|"[^"]*"|`[^`]*`)|\b(function|const|let|return|if|else|for|while|of|new|class|private|break|true|false|null|undefined|this)\b|\b(\d+)\b/g;

function tint(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(TOKEN)) {
    const [text, comment, string, keyword] = match;
    if (match.index > last) parts.push(line.slice(last, match.index));
    const color = comment
      ? 'var(--syn-comment)'
      : string
        ? 'var(--syn-string)'
        : keyword
          ? 'var(--syn-keyword)'
          : 'var(--syn-number)';
    parts.push(
      <span key={match.index} style={{ color, fontStyle: comment ? 'italic' : undefined }}>
        {text}
      </span>,
    );
    last = match.index + text.length;
  }
  parts.push(line.slice(last));
  return parts;
}

export function CodePanel({ code, activeLine, label = 'TypeScript' }: { code: string; activeLine?: number; label?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLDivElement>(null);
  // Colouring depends only on the code, not on the active line, so it is done once per listing.
  const lines = useMemo(() => code.split('\n').map(tint), [code]);

  // Scroll inside the panel only; scrollIntoView would also move the page.
  useEffect(() => {
    const box = container.current;
    const line = active.current;
    if (!box || !line) return;
    const top = line.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + line.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: top - box.clientHeight / 2 + line.offsetHeight / 2 });
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the ref moves to the new line, so scroll when it changes
  }, [activeLine]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2/60">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="eyebrow">{label}</span>
        {activeLine !== undefined && <span className="font-mono text-xs text-muted">line {activeLine}</span>}
      </div>
      <div ref={container} className="max-h-[22rem] overflow-auto py-2" tabIndex={0} role="region" aria-label="Code">
        <pre className="w-max min-w-full font-mono text-[13px] leading-6">
          <code>
            {lines.map((line, i) => {
              const isActive = i + 1 === activeLine;
              return (
                <div
                  key={i}
                  ref={isActive ? active : undefined}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex border-l-[3px] pr-4 transition-colors duration-150 ${
                    isActive ? 'border-accent bg-accent-soft' : 'border-transparent'
                  }`}
                >
                  <span aria-hidden className="w-10 shrink-0 select-none pr-3 text-right text-muted/70">
                    {i + 1}
                  </span>
                  <span className="whitespace-pre">{line}</span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>
    </div>
  );
}
