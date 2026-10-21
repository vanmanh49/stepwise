import { Play } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import type { VisualizationConfig } from '../../../types/lesson';
import { Visualizer } from '../Visualizer';
import { inputModeFor } from './formField';
import type { StepListener } from './LessonVisualization';

type FormConfig = Extract<VisualizationConfig, { kind: 'form' }>;

// Validation lives in config.generate: bad input becomes one explanatory step on the stage.
export function FormInput({ config, code, onStep }: { config: FormConfig; code: string; onStep?: StepListener }) {
  const id = useId();
  const initial = config.presets[0]?.values ?? Object.fromEntries(config.fields.map((f) => [f.name, f.sample]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [ran, setRan] = useState(false);
  const steps = useMemo(() => config.generate(values), [config, values]);

  const run = (next: Record<string, string>) => {
    setDraft(next);
    setValues(next);
    setRan(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run({ ...draft });
  };

  return (
    <Visualizer
      steps={steps}
      code={code}
      codeLabel={config.codeLabel}
      autoPlay={ran}
      onStep={onStep}
      toolbar={
        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* An even grid: every control fills its cell and starts at the same height, with any help text below it. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] items-start gap-x-4 gap-y-3">
            {config.fields.map((field) => {
              const fieldId = `${id}-${field.name}`;
              const value = draft[field.name] ?? '';
              const set = (next: string) => setDraft((d) => ({ ...d, [field.name]: next }));
              const helpId = field.help ? `${fieldId}-help` : undefined;
              return (
                <div key={field.name} className={`flex min-w-0 flex-col gap-1.5 ${field.type === 'numbers' || field.type === 'text' ? 'sm:col-span-2' : ''}`}>
                  <label htmlFor={fieldId} className="eyebrow truncate" title={field.label}>
                    {field.label}
                  </label>
                  {field.type === 'choice' ? (
                    <select id={fieldId} className="field w-full" value={value} onChange={(e) => set(e.target.value)} aria-describedby={helpId}>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={fieldId}
                      className="field w-full font-mono"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      inputMode={inputModeFor(field.type)}
                      autoComplete="off"
                      aria-describedby={helpId}
                    />
                  )}
                  {field.help && (
                    <p id={helpId} className="text-xs leading-snug text-muted">
                      {field.help}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary">
              <Play size={16} aria-hidden /> Run
            </button>
            {config.presets.length > 1 && (
              <>
                <span aria-hidden className="mx-1 h-6 w-px bg-border" />
                <span className="text-sm text-muted">Try:</span>
                {config.presets.map((preset) => (
                  <button key={preset.label} type="button" className="btn" onClick={() => run({ ...preset.values })}>
                    {preset.label}
                  </button>
                ))}
              </>
            )}
          </div>
        </form>
      }
    />
  );
}
