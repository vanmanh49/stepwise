import type { Step } from '../../types/visualization';

export function Variables({ variables }: { variables: Step['variables'] }) {
  const entries = Object.entries(variables ?? {});
  if (entries.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-1.5">
      {entries.map(([name, value]) => (
        <div key={name} className="flex items-baseline gap-1.5 rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs">
          <dt className="text-muted">{name}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Explanation({ step, index, total }: { step: Step; index: number; total: number }) {
  return (
    <div className="flex min-h-[13rem] flex-col gap-3">
      <p className="eyebrow">
        Step {index + 1} of {total}
      </p>
      <h3 aria-live="polite" className="text-lg font-semibold leading-snug tracking-tight">
        {step.title}
      </h3>
      <div className="space-y-2 text-[0.9375rem] leading-relaxed">
        <p>
          <span className="mr-1.5 font-semibold text-accent">Why?</span>
          {step.why}
        </p>
        {step.next && (
          <p className="text-muted">
            <span className="mr-1.5 font-semibold text-text">Next:</span>
            {step.next}
          </p>
        )}
      </div>
      <div className="mt-auto">
        <Variables variables={step.variables} />
      </div>
    </div>
  );
}
