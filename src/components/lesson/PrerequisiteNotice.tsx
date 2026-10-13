import { Lightbulb } from 'lucide-react';
import { Link } from 'react-router';
import { getLesson, lessonPath } from '../../lessons/registry';
import { useProgress } from '../../store/progress';
import type { Lesson } from '../../types/lesson';

/** A recommendation, never a lock: learners can always continue. */
export function PrerequisiteNotice({ lesson }: { lesson: Lesson }) {
  const completed = useProgress((s) => s.completed);
  const missing = lesson.prerequisites
    .map(getLesson)
    .filter((p): p is Lesson => p !== undefined && !completed.includes(p.id));
  if (missing.length === 0) return null;

  return (
    <p className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
      <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-accent" />
      <span>
        Recommended: Complete{' '}
        {missing.map((p, i) => (
          <span key={p.id}>
            {i > 0 && (i === missing.length - 1 ? ' and ' : ', ')}
            <Link to={lessonPath(p)} className="font-semibold underline decoration-border underline-offset-4 hover:text-accent">
              {p.title}
            </Link>
          </span>
        ))}{' '}
        before starting {lesson.title}.
      </span>
    </p>
  );
}
