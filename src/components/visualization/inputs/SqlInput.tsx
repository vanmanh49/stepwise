import { Play, RotateCcw } from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { datasets } from '../../../sql/datasets';
import { MAX_QUERY_LENGTH } from '../../../sql/parse';
import { querySteps } from '../../../sql/steps';
import type { VisualizationConfig } from '../../../types/lesson';
import type { Step } from '../../../types/visualization';
import { SchemaPanel } from '../../sql/SchemaPanel';
import { Visualizer } from '../Visualizer';
import type { StepListener } from './LessonVisualization';

type SqlConfig = Extract<VisualizationConfig, { kind: 'sql' }>;

/** True for Ctrl+Enter or Cmd+Enter, the usual "run" shortcut in SQL editors. */
export const isRunShortcut = (event: KeyboardEvent) => event.key === 'Enter' && (event.ctrlKey || event.metaKey);

/** A query editor over a sample database; any query that runs is stepped through clause by clause. */
export function SqlInput({ config, onStep }: { config: SqlConfig; code: string; onStep?: StepListener }) {
  const id = useId();
  const dataset = datasets[config.dataset];
  const [draft, setDraft] = useState(config.initialQuery);
  const [ran, setRan] = useState(() => {
    const first = querySteps(dataset, config.initialQuery);
    return { query: config.initialQuery, steps: first.ok ? first.steps : ([] as Step[]) };
  });
  const [error, setError] = useState<string>();
  const [autoPlay, setAutoPlay] = useState(false);

  const run = (query: string) => {
    setDraft(query);
    const result = querySteps(dataset, query);
    if (!result.ok) {
      const { message, line, column } = result.error;
      setError(`${message} (line ${line}, col ${column})`);
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
            <label htmlFor={`${id}-query`} className="eyebrow">
              Your query
            </label>
            <textarea
              id={`${id}-query`}
              className="field min-h-36 w-full resize-y py-2 font-mono text-sm leading-relaxed"
              rows={6}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (!isRunShortcut(e)) return;
                e.preventDefault();
                run(draft);
              }}
              maxLength={MAX_QUERY_LENGTH}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-invalid={error !== undefined}
              aria-describedby={`${id}-help`}
            />
            {error ? (
              <p id={`${id}-help`} role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : (
              <p id={`${id}-help`} className="text-sm text-muted">
                Press Run or Ctrl+Enter (⌘+Enter on macOS) to step through your query.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-primary">
                <Play size={16} aria-hidden /> Run
              </button>
              <button type="button" className="btn" onClick={() => run(config.initialQuery)}>
                <RotateCcw size={16} aria-hidden /> Reset to example
              </button>
            </div>
          </form>
          {config.examples.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Try</span>
              <div className="flex flex-wrap gap-2">
                {config.examples.map((example) => (
                  <button key={example.label} type="button" className="btn text-sm" onClick={() => run(example.query)}>
                    {example.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <SchemaPanel dataset={dataset} />
        </div>
      }
    />
  );
}
