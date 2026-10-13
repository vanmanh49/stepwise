import { Play, RotateCcw, Shuffle } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import type { VisualizationConfig } from '../../../types/lesson';
import { parseNumberList, randomArray } from '../../../utils/parseInput';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type SortConfig = Extract<VisualizationConfig, { kind: 'sort' }>;

const LIMITS = { min: 2, max: 12 };

export function SortInput({ config, code, onStep }: { config: SortConfig; code: string; onStep?: StepListener }) {
  const inputId = useId();
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
          <label htmlFor={inputId} className="eyebrow">
            Your data
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={inputId}
              className="field min-w-0 flex-1 basis-56 font-mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={error !== undefined}
              aria-describedby={`${inputId}-help`}
            />
            <button type="submit" className="btn btn-primary">
              <Play size={16} aria-hidden /> Run
            </button>
            <button type="button" className="btn" onClick={() => load(randomArray(8), true)}>
              <Shuffle size={16} aria-hidden /> Random
            </button>
            <button type="button" className="btn" onClick={() => load([...config.initial], false)}>
              <RotateCcw size={16} aria-hidden /> Reset
            </button>
          </div>
          {error ? (
            <p id={`${inputId}-help`} role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : (
            <p id={`${inputId}-help`} className="text-sm text-muted">
              {LIMITS.min}–{LIMITS.max} whole numbers, separated by commas.
            </p>
          )}
        </form>
      }
    />
  );
}
