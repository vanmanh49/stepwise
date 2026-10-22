/** A row of buttons where exactly one is chosen, such as playback speed. */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format = String,
}: {
  /** What the group is, for screen readers. */
  label: string;
  options: readonly T[];
  value: T;
  onChange(value: T): void;
  format?(option: T): string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[10px] border border-border bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`min-h-11 min-w-11 rounded-lg px-2 font-mono text-xs font-semibold transition-colors ${
            option === value ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2'
          }`}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}
