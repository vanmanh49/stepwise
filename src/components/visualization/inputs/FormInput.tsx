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
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {config.fields.map((field) => {
              const fieldId = `${id}-${field.name}`;
              const value = draft[field.name] ?? '';
              const set = (next: string) => setDraft((d) => ({ ...d, [field.name]: next }));
              return (
                <div key={field.name} className={`flex flex-col gap-2 ${field.type === 'number' || field.type === 'choice' ? '' : 'min-w-0 flex-1 basis-48'}`}>
                  <label htmlFor={fieldId} className="eyebrow">
                    {field.label}
                  </label>
                  {field.type === 'choice' ? (
                    <select id={fieldId} className="field pr-8" value={value} onChange={(e) => set(e.target.value)}>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={fieldId}
                      className={`field font-mono ${field.type === 'number' ? 'w-24' : ''}`}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      inputMode={inputModeFor(field.type)}
                      autoComplete="off"
                      aria-describedby={field.help ? `${fieldId}-help` : undefined}
                    />
                  )}
                  {field.help && (
                    <p id={`${fieldId}-help`} className="text-xs text-muted">
                      {field.help}
                    </p>
                  )}
                </div>
              );
            })}
            <button type="submit" className="btn btn-primary">
              <Play size={16} aria-hidden /> Run
            </button>
          </div>
          {config.presets.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Try:</span>
              {config.presets.map((preset) => (
                <button key={preset.label} type="button" className="btn" onClick={() => run({ ...preset.values })}>
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </form>
      }
    />
  );
}
