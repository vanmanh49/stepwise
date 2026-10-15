import { ArrowRight, CircleCheck } from 'lucide-react';
import { Link } from 'react-router';
import { getLesson, lessonPath } from '../../lessons/registry';
import { useProgress } from '../../store/progress';
import type { Topic } from '../../types/lesson';
import { DifficultyBadge } from './DifficultyBadge';

/** A curriculum topic: a link when its lesson exists, a muted placeholder otherwise. */
export function LessonCard({ topic, showDifficulty = false }: { topic: Topic; showDifficulty?: boolean }) {
  const lesson = getLesson(topic.id);
  const done = useProgress((s) => s.completed.includes(topic.id));

  if (!lesson) {
    return (
      <div className="flex h-full flex-col gap-2 rounded-2xl border border-dashed border-border p-5 text-muted">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold">{topic.title}</h3>
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">Coming soon</span>
        </div>
        {topic.group && <p className="text-xs">{topic.group}</p>}
      </div>
    );
  }

  return (
    <Link
      to={lessonPath(lesson)}
      className="card group flex h-full flex-col gap-2 p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold tracking-tight">{lesson.title}</h3>
        {done ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success">
            <CircleCheck size={14} aria-hidden /> Done
          </span>
        ) : (
          <ArrowRight
            size={16}
            aria-hidden
            className="mt-0.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
          />
        )}
      </div>
      <p className="text-sm leading-relaxed text-muted">{lesson.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        {showDifficulty && <DifficultyBadge difficulty={lesson.difficulty} />}
        {lesson.group && <span className="text-xs text-muted">{lesson.group}</span>}
        {lesson.complexity && <span className="ml-auto font-mono text-xs text-muted">{lesson.complexity.rows[0]!.average}</span>}
      </div>
    </Link>
  );
}
