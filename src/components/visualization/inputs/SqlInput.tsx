import { RotateCcw } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { datasets } from '../../../sql/datasets';
import { MAX_QUERY_LENGTH } from '../../../sql/parse';
import { parseScript } from '../../../sql/parse';
import { scriptSteps } from '../../../sql/scriptSteps';
import type { VisualizationConfig } from '../../../types/lesson';
import { SchemaPanel } from '../../sql/SchemaPanel';
import { Button, RunButton } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { FormMessage } from '../../ui/FormMessage';
import { PresetRow } from '../../ui/PresetRow';
import { TextArea } from '../../ui/TextArea';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type SqlConfig = Extract<VisualizationConfig, { kind: 'sql' }>;

/** A query editor over a sample database; any query that runs is stepped through clause by clause. */
export function SqlInput({ config, onStep }: { config: SqlConfig; code: string; onStep?: StepListener }) {
  const helpId = `${useId()}-help`;
  const dataset = datasets[config.dataset];
  // Lessons about changing data open with a script; the wording follows.
  const isScript = useMemo(() => {
    const parsed = parseScript(config.initialQuery);
    return parsed.ok && parsed.statements.some((s) => s.kind !== 'select');
  }, [config.initialQuery]);
  const [draft, setDraft] = useState(config.initialQuery);
  const [ran, setRan] = useState(() => {
    const first = scriptSteps(dataset, config.initialQuery);
    return { query: config.initialQuery, steps: first.steps };
  });
  const [error, setError] = useState<string>();
  const [autoPlay, setAutoPlay] = useState(false);

  const run = (query: string) => {
    setDraft(query);
    const result = scriptSteps(dataset, query);
    if (!result.ok) {
      const { message, line, column } = result.error;
      setError(`${message} (line ${line}, col ${column})`);
      // Statements that ran before the failing one stay visible.
      if (result.steps.length > 0) {
        setRan({ query, steps: result.steps });
        setAutoPlay(false);
      }
      return;
    }
    setError(undefined);
    setRan({ query, steps: result.steps });
    setAutoPlay(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(draft);
  };

  return (
    <Visualizer
      steps={ran.steps}
      code={ran.query}
      codeLabel="SQL"
      autoPlay={autoPlay}
      onStep={onStep}
      toolbar={
        <div className="flex flex-col gap-4">
          <form onSubmit={submit} className="flex flex-col gap-2">
            <Field label={isScript ? 'Your script' : 'Your query'} describedBy={helpId} invalid={error !== undefined}>
              <TextArea className="min-h-36" rows={6} value={draft} onChange={setDraft} onRunShortcut={() => run(draft)} maxLength={MAX_QUERY_LENGTH} />
            </Field>
            <FormMessage id={helpId} error={error}>
              {isScript
                ? 'Separate statements with ;. Each run starts from a fresh copy of the data. Press Run or Ctrl+Enter (⌘+Enter on macOS).'
                : 'Press Run or Ctrl+Enter (⌘+Enter on macOS) to step through your query.'}
            </FormMessage>
            <div className="flex flex-wrap gap-2">
              <RunButton />
              <Button icon={RotateCcw} onClick={() => run(config.initialQuery)}>
                Reset to example
              </Button>
            </div>
          </form>
          <PresetRow presets={config.examples.map((example) => ({ label: example.label, onSelect: () => run(example.query) }))} />
          <SchemaPanel dataset={dataset} />
        </div>
      }
    />
  );
}
