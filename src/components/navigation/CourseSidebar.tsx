import { Circle, CircleCheck } from 'lucide-react';
import { Link } from 'react-router';
import { DIFFICULTIES, topicsIn } from '../../lessons/curriculum';
import { getLesson, lessonPath, lessonsIn } from '../../lessons/registry';
import { percent, useProgress } from '../../store/progress';
import type { Category } from '../../types/lesson';
import { difficultyLabel } from '../lesson/DifficultyBadge';
import { ProgressBar } from '../progress/ProgressBar';

export const CATEGORY_TITLE: Record<Category, string> = {
  'data-structures': 'Data Structures',
  algorithms: 'Algorithms',
};

export function CourseSidebar({ category, activeId }: { category: Category; activeId?: string }) {
  const completed = useProgress((s) => s.completed);
  const live = lessonsIn(category);
  const done = live.filter((l) => completed.includes(l.id)).length;
  const topics = topicsIn(category);

  return (
    <nav aria-label={`${CATEGORY_TITLE[category]} lessons`} className="flex flex-col gap-5">
      <div>
        <Link to={`/${category}`} className="eyebrow hover:text-text">
          {CATEGORY_TITLE[category]}
        </Link>
        <div className="mt-3">
          <ProgressBar value={percent(done, live.length)} label="Completed" detail={`${done} / ${live.length}`} />
        </div>
      </div>

      {DIFFICULTIES.map((difficulty) => (
        <div key={difficulty}>
          <h3 className="mb-1 px-2 text-xs font-semibold text-muted">{difficultyLabel(difficulty)}</h3>
          <ul>
            {topics
              .filter((t) => t.difficulty === difficulty)
              .map((topic) => {
                const lesson = getLesson(topic.id);
                if (!lesson) {
                  return (
                    <li key={topic.id} className="flex min-h-9 items-center gap-2 px-2 text-sm text-muted/70">
                      <Circle size={14} aria-hidden className="shrink-0 opacity-40" />
                      <span className="truncate">{topic.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wide">Soon</span>
                    </li>
                  );
                }
                const isDone = completed.includes(lesson.id);
                const isActive = lesson.id === activeId;
                return (
                  <li key={topic.id}>
                    <Link
                      to={lessonPath(lesson)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm transition-colors ${
                        isActive ? 'bg-accent-soft font-semibold text-accent' : 'hover:bg-surface-2'
                      }`}
                    >
                      {isDone ? (
                        <CircleCheck size={15} className="shrink-0 text-success" aria-label="Completed" />
                      ) : (
                        <Circle size={15} className="shrink-0 text-muted" aria-label="Not completed" />
                      )}
                      <span className="truncate">{topic.title}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
