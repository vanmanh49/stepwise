import { ArrowRight, Code, Eye, Flame, MousePointerClick } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { bubbleSortSteps } from '../algorithms/sorting/bubble';
import { LessonCard } from '../components/lesson/LessonCard';
import { ProgressBar } from '../components/progress/ProgressBar';
import { Roadmap } from '../components/progress/Roadmap';
import { MiniPlayer } from '../components/visualization/MiniPlayer';
import { ButtonLink } from '../components/ui/ButtonLink';
import { curriculum } from '../lessons/curriculum';
import { getLesson, lessonPath, lessons, lessonsIn } from '../lessons/registry';
import { computeStreak, percent, useProgress } from '../store/progress';
import type { Category } from '../types/lesson';

const previewSteps = bubbleSortSteps([5, 3, 8, 1, 6]);
const FEATURED = ['array', 'binary-search', 'bubble-sort', 'binary-search-tree', 'bfs', 'dijkstra'];

const PRINCIPLES = [
  {
    icon: Eye,
    title: 'See every step',
    body: 'Each comparison, swap and pointer move is drawn on screen. You watch the data change instead of imagining it.',
  },
  {
    icon: MousePointerClick,
    title: 'Run it on your own data',
    body: 'Type your own numbers, pick your own start node, push and pop yourself. Step forward, step back, slow it down.',
  },
  {
    icon: Code,
    title: 'Connect code to behaviour',
    body: 'The line of code responsible for the current step is highlighted, with a plain-language reason for why it happened.',
  },
];

function ProgressSummary() {
  const completed = useProgress((s) => s.completed);
  const activeDays = useProgress((s) => s.activeDays);
  const current = useProgress((s) => s.currentLesson);
  if (completed.length === 0) return null;

  const done = (category: Category) =>
    lessonsIn(category).filter((l) => completed.includes(l.id)).length;
  const live = lessons.filter((l) => completed.includes(l.id)).length;
  const streak = computeStreak(activeDays);
  const resume = current ? getLesson(current) : undefined;

  return (
    <section aria-labelledby="progress-title" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="card grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-3">
          <h2 id="progress-title" className="text-2xl font-semibold tracking-tight">
            Your learning progress
          </h2>
          <p className="text-muted">
            {live} of {lessons.length} lessons completed
            {streak > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-medium text-text">
                <Flame size={15} aria-hidden className="text-accent" /> {streak}-day streak
              </span>
            )}
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {resume && (
              <ButtonLink to={lessonPath(resume)} variant="primary">
                Continue: {resume.title}
              </ButtonLink>
            )}
            <ButtonLink to="/dashboard">
              View dashboard
            </ButtonLink>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-5">
          <ProgressBar label="Overall" value={percent(live, lessons.length)} />
          <ProgressBar label="Data Structures" value={percent(done('data-structures'), lessonsIn('data-structures').length)} />
          <ProgressBar label="Algorithms" value={percent(done('algorithms'), lessonsIn('algorithms').length)} />
          <ProgressBar label="SQL" value={percent(done('sql'), lessonsIn('sql').length)} />
          <ProgressBar label="Microservices" value={percent(done('microservices'), lessonsIn('microservices').length)} />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  useEffect(() => {
    document.title = 'Stepwise — Learn Data Structures & Algorithms Visually';
  }, []);

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          <p className="eyebrow">Interactive lessons · {lessons.length} available</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Learn Data Structures &amp; Algorithms Visually
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Understand how data structures work and see algorithms execute step by step.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to="/data-structures" variant="primary" className="min-h-12 px-5">
              Explore Data Structures <ArrowRight size={17} aria-hidden />
            </ButtonLink>
            <ButtonLink to="/algorithms" className="min-h-12 px-5">
              Explore Algorithms <ArrowRight size={17} aria-hidden />
            </ButtonLink>
          </div>
        </div>
        <div>
          <MiniPlayer steps={previewSteps} label="Live preview: bubble sort" />
          <p className="mt-3 text-center text-sm text-muted">
            This is a real lesson running.{' '}
            <Link to="/algorithms/bubble-sort" className="font-medium text-accent underline-offset-4 hover:underline">
              Open it and take control
            </Link>
          </p>
        </div>
      </section>

      <ProgressSummary />

      <section aria-labelledby="philosophy-title" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="philosophy-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Learn by Seeing, Not Just Reading
          </h2>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
            An algorithm is a process, and a process is hard to understand from a paragraph. Watching it run, one
            decision at a time, turns memorised rules into something you can predict.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={19} aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="roadmap-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="roadmap-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Learning roadmap
        </h2>
        <p className="mb-8 mt-3 max-w-2xl text-lg leading-relaxed text-muted">
          A recommended order from first principles to advanced topics. Nothing is locked: jump in wherever you like.
        </p>
        <Roadmap />
      </section>

      <section aria-labelledby="featured-title" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 id="featured-title" className="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">
          Featured lessons
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {curriculum
            .filter((t) => FEATURED.includes(t.id))
            .map((topic) => (
              <li key={topic.id}>
                <LessonCard topic={topic} showDifficulty />
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
