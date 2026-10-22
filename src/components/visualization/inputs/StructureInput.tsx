import { RotateCcw } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { StructureDef, StructureOp, VisualizationConfig } from '../../../types/lesson';
import { parseOpFields } from '../../../data-structures/shared';
import type { Step } from '../../../types/visualization';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { FormMessage } from '../../ui/FormMessage';
import { TextField } from '../../ui/TextField';
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
        <Field key={arg.name} label={arg.label} compact>
          <TextField
            value={fields[i] ?? ''}
            onChange={(next) => setFields(fields.map((f, k) => (k === i ? next : f)))}
            width={'text' in arg ? 'sm' : 'xs'}
            inputMode={'text' in arg ? 'text' : 'numeric'}
          />
        </Field>
      ))}
      <Button type="submit" variant="primary">
        {op.label}
      </Button>
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
  const errorId = `${useId()}-error`;

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
            <Button icon={RotateCcw} className="mb-1.5" onClick={reset}>
              Reset
            </Button>
          </div>
          <FormMessage id={errorId} error={error} />
        </div>
      }
    />
  );
}
