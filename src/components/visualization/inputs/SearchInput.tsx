import { RotateCcw, Shuffle } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { prepareSearchInput } from '../../../algorithms/searching/binary';
import type { VisualizationConfig } from '../../../types/lesson';
import { parseNumberList, randomArray } from '../../../utils/parseInput';
import { Button, RunButton } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { FormMessage } from '../../ui/FormMessage';
import { TextField } from '../../ui/TextField';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type SearchConfig = Extract<VisualizationConfig, { kind: 'search' }>;

const LIMITS = { min: 1, max: 12 };

export function SearchInput({ config, code, onStep }: { config: SearchConfig; code: string; onStep?: StepListener }) {
  const helpId = `${useId()}-help`;
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
            <Field label={`Your data${config.needsSorted ? ' (sorted)' : ''}`} describedBy={helpId} invalid={error?.field === 'data'} className="flex-1 basis-56">
              <TextField value={text} onChange={setText} inputMode="numeric" />
            </Field>
            <Field label={targetLabel} describedBy={helpId} invalid={error?.field === 'target'} className="w-28">
              <TextField value={targetText} onChange={setTargetText} inputMode="numeric" />
            </Field>
            <RunButton />
            <Button icon={Shuffle} onClick={random}>
              Random
            </Button>
            <Button icon={RotateCcw} onClick={() => load(config.initial, config.target, false)}>
              Reset
            </Button>
          </div>
          <FormMessage id={helpId} error={error?.message}>
            {config.targetHelp ?? `${LIMITS.min}–${LIMITS.max} whole numbers, separated by commas, and one target to look for.`}
          </FormMessage>
        </form>
      }
    />
  );
}
