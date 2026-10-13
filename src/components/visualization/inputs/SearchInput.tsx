import { Play, RotateCcw, Shuffle } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { prepareSearchInput } from '../../../algorithms/searching/binary';
import type { VisualizationConfig } from '../../../types/lesson';
import { parseNumberList, randomArray } from '../../../utils/parseInput';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type SearchConfig = Extract<VisualizationConfig, { kind: 'search' }>;

const LIMITS = { min: 1, max: 12 };

export function SearchInput({ config, code, onStep }: { config: SearchConfig; code: string; onStep?: StepListener }) {
  const id = useId();
  const targetLabel = config.targetLabel ?? 'Target';
  const [run, setRun] = useState({ values: config.initial, target: config.target, wasSorted: false });
  const [text, setText] = useState(config.initial.join(', '));
  const [targetText, setTargetText] = useState(String(config.target));
  const [error, setError] = useState<{ field: 'data' | 'target'; message: string }>();
  const [ran, setRan] = useState(false);
  const steps = useMemo(() => config.generate(run.values, run.target), [config, run]);

  const load = (values: number[], target: number, autoPlay: boolean) => {
    const prepared = prepareSearchInput(values, config.needsSorted);
    setText(prepared.values.join(', '));
    setTargetText(String(target));
    setRun({ ...prepared, target });
    setError(undefined);
    setRan(autoPlay);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const list = parseNumberList(text, LIMITS);
    if (!list.ok) return setError({ field: 'data', message: list.error });
    // The second value may exceed the per-item range: a target sum of two items can reach 1998.
    if (!/^-?\d{1,4}$/.test(targetText.trim())) {
      return setError({ field: 'target', message: `Enter one whole number for ${targetLabel.toLowerCase()}.` });
    }
    load(list.values, Number(targetText), true);
  };

  const random = () => {
    const values = randomArray(10);
    // Usually pick a value that exists, so both outcomes show up.
    const target = config.randomTarget
      ? config.randomTarget(values)
      : Math.random() < 0.8
        ? values[Math.floor(Math.random() * values.length)]!
        : 100;
    load(values, target, true);
  };

  return (
    <Visualizer
      steps={steps}
      code={code}
      autoPlay={ran}
      onStep={onStep}
      notice={run.wasSorted ? 'Sorted your input first: this algorithm needs sorted data.' : undefined}
      toolbar={
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-1 basis-56 flex-col gap-2">
              <label htmlFor={`${id}-data`} className="eyebrow">
                Your data{config.needsSorted && ' (sorted)'}
              </label>
              <input
                id={`${id}-data`}
                className="field font-mono"
                value={text}
                onChange={(e) => setText(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={error?.field === 'data'}
                aria-describedby={`${id}-help`}
              />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <label htmlFor={`${id}-target`} className="eyebrow whitespace-nowrap">
                {targetLabel}
              </label>
              <input
                id={`${id}-target`}
                className="field font-mono"
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={error?.field === 'target'}
                aria-describedby={`${id}-help`}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              <Play size={16} aria-hidden /> Run
            </button>
            <button type="button" className="btn" onClick={random}>
              <Shuffle size={16} aria-hidden /> Random
            </button>
            <button type="button" className="btn" onClick={() => load(config.initial, config.target, false)}>
              <RotateCcw size={16} aria-hidden /> Reset
            </button>
          </div>
          {error ? (
            <p id={`${id}-help`} role="alert" className="text-sm font-medium text-danger">
              {error.message}
            </p>
          ) : (
            <p id={`${id}-help`} className="text-sm text-muted">
              {config.targetHelp ?? `${LIMITS.min}–${LIMITS.max} whole numbers, separated by commas, and one target to look for.`}
            </p>
          )}
        </form>
      }
    />
  );
}
