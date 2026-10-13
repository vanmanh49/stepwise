import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { curriculum, roadmap } from '../../lessons/curriculum';
import { getLesson, lessonPath } from '../../lessons/registry';
import { useProgress } from '../../store/progress';

const titleOf = (id: string) => curriculum.find((t) => t.id === id)?.title ?? id;

/** The recommended journey. Everything is reachable in any order; this only suggests one. */
export function Roadmap() {
  const completed = useProgress((s) => s.completed);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {roadmap.map((stage, stageIndex) => (
        <section key={stage.stage} aria-label={stage.stage} className="card p-5 sm:p-6">
          <p className="eyebrow">Stage {stageIndex + 1}</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">{stage.stage}</h3>
          <ol className="mt-5">
            {stage.steps.map((step, i) => {
              const live = step.topicIds.filter((id) => getLesson(id));
              const done = live.length > 0 && live.every((id) => completed.includes(id));
              const last = i === stage.steps.length - 1;
              return (
                <li key={step.label} className="relative flex gap-3.5 pb-5 last:pb-0">
                  {!last && <span aria-hidden className="absolute left-[11px] top-7 h-[calc(100%-1.75rem)] w-px bg-border" />}
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[11px] font-semibold ${
                      done ? 'border-success bg-success text-bg' : 'border-border bg-surface text-muted'
                    }`}
                  >
                    {done ? <Check size={13} aria-label="Completed" /> : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{step.label}</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {step.topicIds.map((id) => {
                        const lesson = getLesson(id);
                        return (
                          <li key={id}>
                            {lesson ? (
                              <Link
                                to={lessonPath(lesson)}
                                className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-sm transition-colors hover:border-accent hover:text-accent ${
                                  completed.includes(id) ? 'border-success/50' : 'border-border'
                                } bg-surface`}
                              >
                                {completed.includes(id) && <Check size={12} aria-label="Completed" className="text-success" />}
                                {lesson.title}
                              </Link>
                            ) : (
                              <span className="inline-flex min-h-8 items-center rounded-lg border border-dashed border-border px-2.5 text-sm text-muted">
                                {titleOf(id)} · soon
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
