import { useMemo, useState, type FormEvent } from 'react';
import type { VisualizationConfig } from '../../../types/lesson';
import { RunButton } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { FieldGrid } from '../../ui/FieldGrid';
import { PresetRow } from '../../ui/PresetRow';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { Visualizer } from '../Visualizer';
import { inputModeFor } from './formField';
import type { StepListener } from './LessonVisualization';

type FormConfig = Extract<VisualizationConfig, { kind: 'form' }>;

// Validation lives in config.generate: bad input becomes one explanatory step on the stage.
export function FormInput({ config, code, onStep }: { config: FormConfig; code: string; onStep?: StepListener }) {
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
          <FieldGrid>
            {config.fields.map((field) => {
              const set = (next: string) => setDraft((d) => ({ ...d, [field.name]: next }));
              return (
                <Field key={field.name} label={field.label} help={field.help} wide={field.type === 'numbers' || field.type === 'text'}>
                  {field.type === 'choice' ? (
                    <Select value={draft[field.name] ?? ''} options={field.options ?? []} onChange={set} />
                  ) : (
                    <TextField value={draft[field.name] ?? ''} onChange={set} inputMode={inputModeFor(field.type)} />
                  )}
                </Field>
              );
            })}
          </FieldGrid>
          <PresetRow
            leading={<RunButton />}
            presets={config.presets.length > 1 ? config.presets.map((preset) => ({ label: preset.label, onSelect: () => run({ ...preset.values }) })) : []}
          />
        </form>
      }
    />
  );
}
