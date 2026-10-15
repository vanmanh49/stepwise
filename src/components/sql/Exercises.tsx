import { CircleCheck, Lightbulb } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { checkExercise, describeCheck, type CheckResult } from '../../sql/check';
import { datasets, type DatasetId } from '../../sql/datasets';
import { MAX_QUERY_LENGTH } from '../../sql/parse';
import { useProgress } from '../../store/progress';
import type { SqlExercise } from '../../types/lesson';
import { isRunShortcut } from '../visualization/inputs/SqlInput';

function Exercise({
  lessonId,
  dataset,
  exercise,
  number,
  allIds,
}: {
  lessonId: string;
  dataset: DatasetId;
  exercise: SqlExercise;
  number: number;
  allIds: string[];
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CheckResult>();
  const [hint, setHint] = useState(false);
  const solved = useProgress((s) => s.exercises.includes(`${lessonId}/${exercise.id}`));
  const solveExercise = useProgress((s) => s.solveExercise);

  const check = (event?: FormEvent) => {
    event?.preventDefault();
    const outcome = checkExercise(datasets[dataset], query, exercise);
    setResult(outcome);
    if (outcome.status === 'correct') solveExercise(lessonId, exercise.id, allIds);
  };

  return (
    <li className="card p-4 sm:p-5">
      <form onSubmit={check} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <label htmlFor={`${id}-query`} className="font-medium leading-snug">
            <span className="text-muted">{number}.</span> {exercise.prompt}
          </label>
          {solved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
              <CircleCheck size={14} aria-hidden /> Solved
            </span>
          )}
        </div>
        <textarea
          id={`${id}-query`}
          className="field min-h-24 w-full resize-y py-2 font-mono text-sm leading-relaxed"
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (!isRunShortcut(e)) return;
            e.preventDefault();
            check();
          }}
          placeholder="SELECT …"
          maxLength={MAX_QUERY_LENGTH}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary">
            Check
          </button>
          {exercise.hint && (
            <button type="button" className="btn" onClick={() => setHint(true)} aria-expanded={hint}>
              <Lightbulb size={16} aria-hidden /> Show hint
            </button>
          )}
        </div>
        <p role="status" className={`min-h-5 text-sm font-medium ${result?.status === 'correct' ? 'text-accent' : 'text-danger'}`}>
          {result && describeCheck(result)}
        </p>
        {hint && exercise.hint && <p className="text-sm text-muted">Hint: {exercise.hint}</p>}
      </form>
    </li>
  );
}

/** Writing tasks checked by comparing the learner's result with the solution's. */
export function Exercises({ lessonId, dataset, exercises }: { lessonId: string; dataset: DatasetId; exercises: SqlExercise[] }) {
  const allIds = exercises.map((e) => e.id);
  return (
    <ol className="flex flex-col gap-4">
      {exercises.map((exercise, i) => (
        <Exercise key={exercise.id} lessonId={lessonId} dataset={dataset} exercise={exercise} number={i + 1} allIds={allIds} />
      ))}
    </ol>
  );
}
