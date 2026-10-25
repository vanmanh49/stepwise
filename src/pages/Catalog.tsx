import { useEffect } from 'react';
import { DifficultyBadge } from '../components/lesson/DifficultyBadge';
import { LessonCard } from '../components/lesson/LessonCard';
import { CATEGORY_TITLE } from '../lessons/labels';
import { ProgressBar } from '../components/progress/ProgressBar';
import { DIFFICULTIES, topicsIn } from '../lessons/curriculum';
import { lessonsIn } from '../lessons/registry';
import { countDone, percent, useProgress } from '../store/progress';
import type { Category } from '../types/lesson';

const INTRO: Record<Category, string> = {
  'data-structures':
    'Ways of organising data so that the operations you need are fast. Each lesson lets you run the operations yourself and watch what moves.',
  algorithms:
    'Step-by-step procedures for searching, sorting and exploring data. Each lesson plays the algorithm on your own input, one decision at a time.',
  sql: 'Ask questions of a database. Each lesson runs your query one clause at a time, so you can see which rows every clause keeps, joins, groups or removes.',
  microservices:
    'How a system made of many small services stays fast and keeps working when parts of it fail. Each lesson runs a simulated system on your settings, one message at a time.',
  kubernetes:
    'How Kubernetes keeps your apps running: you declare what you want, and controllers keep working until the cluster matches. Each lesson runs a simulated cluster on your settings, one change at a time.',
  ai: 'How large language models work, from the first token to AI agents. Each lesson runs a tiny model on your input, so you can see every number it computes.',
};

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
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{INTRO[category]}</p>
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
