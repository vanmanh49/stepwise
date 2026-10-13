export function ProgressBar({ value, label, detail }: { value: number; label: string; detail?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted">{detail ?? `${value}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
