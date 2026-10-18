import { RotateCcw } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { StructureDef, StructureOp, VisualizationConfig } from '../../../types/lesson';
import { parseOpFields } from '../../../data-structures/shared';
import type { Step } from '../../../types/visualization';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type StructureConfig = Extract<VisualizationConfig, { kind: 'structure' }>;

const idle = (structure: StructureDef<unknown>, state: unknown): Step[] => [
  {
    title: 'Pick an operation',
    why: 'Choose an operation above to watch it run step by step on the current contents.',
    codeLine: 1,
    view: structure.view(state),
  },
];

function OperationForm({
  op,
  onRun,
  onError,
}: {
  op: StructureOp<unknown>;
  onRun(args: number[], words: string[]): void;
  onError(message: string): void;
}) {
  const id = useId();
  const [fields, setFields] = useState(() => op.args.map((a) => String(a.sample)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseOpFields(op, fields);
    if (!parsed.ok) return onError(parsed.error);
    onRun(parsed.args, parsed.words);
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-1.5 rounded-xl border border-border bg-surface-2/50 p-1.5">
      {op.args.map((arg, i) => (
        <div key={arg.name} className="flex flex-col gap-1">
          <label htmlFor={`${id}-${arg.name}`} className="px-1 text-[11px] font-medium text-muted">
            {arg.label}
          </label>
          <input
            id={`${id}-${arg.name}`}
            className={`field px-2 font-mono ${'text' in arg ? 'w-24' : 'w-16'}`}
            value={fields[i]}
            onChange={(e) => setFields(fields.map((f, k) => (k === i ? e.target.value : f)))}
            inputMode={'text' in arg ? 'text' : 'numeric'}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ))}
      <button type="submit" className="btn btn-primary">
        {op.label}
      </button>
    </form>
  );
}

export function StructureInput({
  config,
  code,
  onStep,
}: {
  config: StructureConfig;
  code: string;
  onStep?: StepListener;
}) {
  const { structure } = config;
  // Contents persist between operations so learners can build on their own changes.
  const [state, setState] = useState(structure.initial);
  const [steps, setSteps] = useState(() => idle(structure, structure.initial));
  const [error, setError] = useState<string>();
  const [ran, setRan] = useState(false);

  const run = (op: StructureOp<unknown>, args: number[], words: string[]) => {
    const result = op.run(state, args, words);
    setState(result.state);
    setSteps(result.steps);
    setError(undefined);
    setRan(true);
  };

  const reset = () => {
    setState(structure.initial);
    setSteps(idle(structure, structure.initial));
    setError(undefined);
    setRan(false);
  };

  return (
    <Visualizer
      steps={steps}
      code={code}
      autoPlay={ran}
      onStep={onStep}
      toolbar={
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Operations</span>
          <div className="flex flex-wrap items-end gap-2">
            {structure.ops.map((op) => (
              <OperationForm key={op.id} op={op} onRun={(args, words) => run(op, args, words)} onError={setError} />
            ))}
            <button type="button" className="btn mb-1.5" onClick={reset}>
              <RotateCcw size={16} aria-hidden /> Reset
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>
      }
    />
  );
}
