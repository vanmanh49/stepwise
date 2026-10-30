import { useEffect } from 'react';
import { DifficultyBadge } from '../components/lesson/DifficultyBadge';
import { LessonCard } from '../components/lesson/LessonCard';
import { CATEGORY_INTRO, CATEGORY_TITLE } from '../lessons/labels';
import { ProgressBar } from '../components/progress/ProgressBar';
import { DIFFICULTIES, topicsIn } from '../lessons/curriculum';
import { lessonsIn } from '../lessons/registry';
import { countDone, percent, useProgress } from '../store/progress';
import type { Category } from '../types/lesson';

const LEVEL_NOTE = {
  beginner: 'Start here. No prior computer science knowledge needed.',
  intermediate: 'Builds on the beginner lessons.',
  advanced: 'For when the fundamentals feel comfortable.',
};

export default function Catalog({ category }: { category: Category }) {
  const completed = useProgress((s) => s.completed);
  const live = lessonsIn(category);
  const done = countDone(live, completed);
  const topics = topicsIn(category);

  useEffect(() => {
    document.title = `${CATEGORY_TITLE[category]} — Stepwise`;
  }, [category]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="grid items-end gap-8 md:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="eyebrow">
            {live.length} interactive lessons · {topics.length - live.length} planned
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{CATEGORY_TITLE[category]}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{CATEGORY_INTRO[category]}</p>
        </div>
        <div className="card p-5">
          <ProgressBar label="Your progress" value={percent(done, live.length)} detail={`${done} / ${live.length} lessons`} />
        </div>
      </header>

      {DIFFICULTIES.map((difficulty) => (
        <section key={difficulty} aria-labelledby={`${difficulty}-title`} className="mt-14">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <h2 id={`${difficulty}-title`} className="sr-only">
              {difficulty}
            </h2>
            <DifficultyBadge difficulty={difficulty} />
            <p className="text-sm text-muted">{LEVEL_NOTE[difficulty]}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics
              .filter((t) => t.difficulty === difficulty)
              .map((topic) => (
                <li key={topic.id}>
                  <LessonCard topic={topic} />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
