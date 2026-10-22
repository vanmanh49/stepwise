import { RotateCcw, Shuffle } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import type { VisualizationConfig } from '../../../types/lesson';
import { parseNumberList, randomArray } from '../../../utils/parseInput';
import { Button, RunButton } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { FormMessage } from '../../ui/FormMessage';
import { TextField } from '../../ui/TextField';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type SortConfig = Extract<VisualizationConfig, { kind: 'sort' }>;

const LIMITS = { min: 2, max: 12 };

export function SortInput({ config, code, onStep }: { config: SortConfig; code: string; onStep?: StepListener }) {
  const helpId = `${useId()}-help`;
  const [values, setValues] = useState(config.initial);
  const [text, setText] = useState(config.initial.join(', '));
  const [error, setError] = useState<string>();
  const [ran, setRan] = useState(false);
  const steps = useMemo(() => config.generate(values), [config, values]);

  const load = (next: number[], autoPlay: boolean) => {
    setText(next.join(', '));
    setValues(next);
    setError(undefined);
    setRan(autoPlay);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = parseNumberList(text, LIMITS);
    // On invalid input the previous run stays on screen.
    if (result.ok) load(result.values, true);
    else setError(result.error);
  };

  return (
    <Visualizer
      steps={steps}
      code={code}
      autoPlay={ran}
      onStep={onStep}
      toolbar={
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Your data" describedBy={helpId} invalid={error !== undefined} className="flex-1 basis-56">
              <TextField value={text} onChange={setText} inputMode="numeric" />
            </Field>
            <RunButton />
            <Button icon={Shuffle} onClick={() => load(randomArray(8, config.randomMax ?? 99, config.randomMin ?? 1), true)}>
              Random
            </Button>
            <Button icon={RotateCcw} onClick={() => load([...config.initial], false)}>
              Reset
            </Button>
          </div>
          <FormMessage id={helpId} error={error}>
            {LIMITS.min}–{LIMITS.max} whole numbers, separated by commas.
          </FormMessage>
        </form>
      }
    />
  );
}
