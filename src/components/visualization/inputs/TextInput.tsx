import { RotateCcw } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { TextDef, TextOp, VisualizationConfig } from '../../../types/lesson';
import type { Step } from '../../../types/visualization';
import { MAX_TEXT_LENGTH, parseText } from '../../../utils/parseInput';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type TextConfig = Extract<VisualizationConfig, { kind: 'text' }>;

const idle = (def: TextDef, text: string): Step[] => [
  {
    title: 'Pick an operation',
    why: 'Choose an operation above to watch it run step by step on the current text.',
    codeLine: 1,
    view: def.view(text),
  },
];

function OperationForm({ op, onRun }: { op: TextOp; onRun(arg: string): void }) {
  const id = useId();
  const [field, setField] = useState(op.arg?.sample ?? '');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onRun(field);
  };
  return (
    <form onSubmit={submit} className="flex items-end gap-1.5 rounded-xl border border-border bg-surface-2/50 p-1.5">
      {op.arg && (
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="px-1 text-[11px] font-medium text-muted">
            {op.arg.label}
          </label>
          <input
            id={id}
            className={`field px-2 font-mono ${op.arg.numeric ? 'w-16' : 'w-24'}`}
            value={field}
            onChange={(e) => setField(e.target.value)}
            inputMode={op.arg.numeric ? 'numeric' : 'text'}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
      <button type="submit" className="btn btn-primary">
        {op.label}
      </button>
    </form>
  );
}

/** Operation buttons for a text-based structure; the text persists between operations. */
export function TextInput({ config, code, onStep }: { config: TextConfig; code: string; onStep?: StepListener }) {
  const def = config.text;
  const id = useId();
  const [text, setText] = useState(def.initial);
  const [draft, setDraft] = useState(def.initial);
  const [steps, setSteps] = useState(() => idle(def, def.initial));
  const [error, setError] = useState<string>();
  const [ran, setRan] = useState(false);

  const load = (next: string) => {
    setText(next);
    setDraft(next);
    setSteps(idle(def, next));
    setError(undefined);
    setRan(false);
  };

  const setOwnText = (event: FormEvent) => {
    event.preventDefault();
    const result = parseText(draft);
    if (result.ok) load(result.value);
    else setError(result.error);
  };

  const run = (op: TextOp, arg: string) => {
    // Use what is in the field even if "Set text" was not pressed first.
    let base = text;
    if (draft !== text) {
      const typed = parseText(draft);
      if (!typed.ok) return setError(typed.error);
      base = typed.value;
    }
    const result = op.run(base, arg);
    setText(result.text);
    setDraft(result.text);
    setSteps(result.steps);
    setError(undefined);
    setRan(true);
  };

  return (
    <Visualizer
      steps={steps}
      code={code}
      autoPlay={ran}
      onStep={onStep}
      toolbar={
        <div className="flex flex-col gap-3">
          <form onSubmit={setOwnText} className="flex flex-col gap-2">
            <label htmlFor={`${id}-text`} className="eyebrow">
              Your text
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`${id}-text`}
                className="field min-w-0 flex-1 basis-40 font-mono"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_TEXT_LENGTH * 2}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error !== undefined}
                aria-describedby={`${id}-help`}
              />
              <button type="submit" className="btn">
                Set text
              </button>
              <button type="button" className="btn" onClick={() => load(def.initial)}>
                <RotateCcw size={16} aria-hidden /> Reset
              </button>
            </div>
            {error ? (
              <p id={`${id}-help`} role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : (
              <p id={`${id}-help`} className="text-sm text-muted">
                1–{MAX_TEXT_LENGTH} characters.
              </p>
            )}
          </form>
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Operations</span>
            <div className="flex flex-wrap items-end gap-2">
              {def.ops.map((op) => (
                <OperationForm key={op.id} op={op} onRun={(arg) => run(op, arg)} />
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}
