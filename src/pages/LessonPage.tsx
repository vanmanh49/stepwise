import { ArrowLeft, ArrowRight, CircleCheck, Menu } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { BigOChart } from '../components/bigo/BigOChart';
import { CodePanel } from '../components/code/CodePanel';
import { ComplexityTable } from '../components/lesson/ComplexityTable';
import { DifficultyBadge } from '../components/lesson/DifficultyBadge';
import {
  Applications,
  CommonMistakes,
  Concept,
  HowItWorks,
  Section,
  Summary,
  TradeOffs,
} from '../components/lesson/LessonSections';
import { PrerequisiteNotice } from '../components/lesson/PrerequisiteNotice';
import { CATEGORY_TITLE, CourseSidebar } from '../components/navigation/CourseSidebar';
import { Drawer } from '../components/navigation/Drawer';
import { Quiz } from '../components/quiz/Quiz';
import { Variables } from '../components/visualization/Explanation';
import { LessonVisualization } from '../components/visualization/inputs/LessonVisualization';
import { adjacentLessons, getLesson, lessonPath } from '../lessons/registry';
import { useProgress } from '../store/progress';
import type { Category, Lesson } from '../types/lesson';
import type { Step } from '../types/visualization';
import NotFound from './NotFound';

const SECTIONS = [
  ['visualization', 'See it run'],
  ['concept', 'The idea'],
  ['how-it-works', 'How it works'],
  ['code', 'Code'],
  ['complexity', 'Complexity'],
  ['trade-offs', 'Strengths and trade-offs'],
  ['applications', 'Where it is used'],
  ['mistakes', 'Common mistakes'],
  ['practice', 'Practice'],
  ['summary', 'Summary'],
] as const;

interface Live {
  step: Step;
  index: number;
  total: number;
}

function ContextPanel({ lesson, live }: { lesson: Lesson; live?: Live }) {
  const main = lesson.complexity.rows[0]!;
  return (
    <div className="flex flex-col gap-6 text-sm">
      <div>
        <p className="eyebrow">Now running</p>
        {live ? (
          <div className="mt-2 space-y-2.5">
            <p className="font-mono text-xs text-muted">
              Step {live.index + 1} / {live.total}
            </p>
            <p className="font-semibold leading-snug">{live.step.title}</p>
            <Variables variables={live.step.variables} />
          </div>
        ) : (
          <p className="mt-2 text-muted">Press play to begin.</p>
        )}
      </div>

      <div>
        <p className="eyebrow">Complexity</p>
        <dl className="mt-2 space-y-1.5">
          {(
            [
              [lesson.category === 'algorithms' ? 'Average time' : main.label, main.average],
              ['Worst case', main.worst],
              ['Space', lesson.complexity.space],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{label}</dt>
              <dd className="font-mono font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <nav aria-label="On this page">
        <p className="eyebrow">On this page</p>
        <ul className="mt-2 space-y-0.5">
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className="flex min-h-11 items-center rounded-md px-2 text-muted hover:bg-surface-2 hover:text-text">
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function LessonContent({ lesson }: { lesson: Lesson }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [live, setLive] = useState<Live>();
  const visit = useProgress((s) => s.visit);
  const isComplete = useProgress((s) => s.completed.includes(lesson.id));
  const markComplete = useProgress((s) => s.markComplete);
  const unmarkComplete = useProgress((s) => s.unmarkComplete);
  const { prev, next } = adjacentLessons(lesson.id);

  useEffect(() => {
    visit(lesson.id);
    document.title = `${lesson.title} — Stepwise`;
  }, [lesson, visit]);

  const onStep = useCallback((step: Step, index: number, total: number) => setLive({ step, index, total }), []);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-10 xl:grid-cols-[230px_minmax(0,1fr)_230px]">
      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] self-start overflow-y-auto pr-1 lg:block">
        <CourseSidebar category={lesson.category} activeId={lesson.id} />
      </aside>

      <article className="min-w-0 space-y-14">
        <header className="space-y-4">
          <div className="flex items-center gap-3 lg:hidden">
            <button type="button" className="btn" onClick={() => setDrawerOpen(true)}>
              <Menu size={16} aria-hidden /> Lessons
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link to={`/${lesson.category}`} className="hover:text-text">
              {CATEGORY_TITLE[lesson.category]}
            </Link>
            {lesson.group && (
              <>
                <span aria-hidden>/</span>
                <span>{lesson.group}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{lesson.title}</h1>
            <DifficultyBadge difficulty={lesson.difficulty} />
            {isComplete && (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                <CircleCheck size={16} aria-hidden /> Completed
              </span>
            )}
          </div>
          <p className="max-w-[68ch] text-lg leading-relaxed text-muted">{lesson.overview}</p>
          <PrerequisiteNotice lesson={lesson} />
        </header>

        <Section id="visualization" title="See it run">
          <LessonVisualization config={lesson.visualization} code={lesson.code} onStep={onStep} />
        </Section>

        <Section id="concept" title="The idea">
          <Concept lesson={lesson} />
        </Section>

        <Section id="how-it-works" title="How it works">
          <HowItWorks lesson={lesson} />
        </Section>

        <Section id="code" title="Code">
          <p className="mb-4 max-w-[68ch] text-muted">
            The full TypeScript implementation. In the visualization above, the highlighted line follows this code as
            each step runs.
          </p>
          <CodePanel code={lesson.code} />
        </Section>

        <Section id="complexity" title="Complexity">
          <div className="space-y-4">
            <ComplexityTable lesson={lesson} />
            {lesson.category === 'data-structures' && (
              <p className="text-sm">
                <span className="text-muted">Space:</span>{' '}
                <span className="font-mono font-semibold">{lesson.complexity.space}</span>
              </p>
            )}
            <p className="max-w-[68ch] leading-relaxed">{lesson.complexity.note}</p>
            <figure className="card max-w-2xl p-4">
              <BigOChart compact highlight={lesson.complexity.curves} />
              <figcaption className="mt-2 text-sm text-muted">
                How this lesson's complexity grows with input size.{' '}
                <Link to="/big-o" className="font-medium text-accent underline-offset-4 hover:underline">
                  Open the Big O explorer
                </Link>
              </figcaption>
            </figure>
          </div>
        </Section>

        <Section id="trade-offs" title="Strengths and trade-offs">
          <TradeOffs lesson={lesson} />
        </Section>

        <Section id="applications" title="Where it is used">
          <Applications lesson={lesson} />
        </Section>

        <Section id="mistakes" title="Common mistakes">
          <CommonMistakes lesson={lesson} />
        </Section>

        <Section id="practice" title="Practice">
          <Quiz lessonId={lesson.id} questions={lesson.quiz} />
        </Section>

        <Section id="summary" title="Summary">
          <Summary lesson={lesson} />
        </Section>

        <footer className="space-y-6 border-t border-border pt-8">
          <button
            type="button"
            className={`btn ${isComplete ? '' : 'btn-primary'}`}
            onClick={() => (isComplete ? unmarkComplete(lesson.id) : markComplete(lesson.id))}
            aria-pressed={isComplete}
          >
            <CircleCheck size={17} aria-hidden />
            {isComplete ? 'Completed — mark as not done' : 'Mark as complete'}
          </button>
          <nav aria-label="Lesson navigation" className="grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link to={lessonPath(prev)} className="card flex items-center gap-3 p-4 transition-colors hover:border-accent">
                <ArrowLeft size={18} aria-hidden className="shrink-0 text-muted" />
                <span>
                  <span className="block text-xs text-muted">Previous lesson</span>
                  <span className="font-semibold">{prev.title}</span>
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to={lessonPath(next)}
                className="card flex items-center justify-end gap-3 p-4 text-right transition-colors hover:border-accent"
              >
                <span>
                  <span className="block text-xs text-muted">Next lesson</span>
                  <span className="font-semibold">{next.title}</span>
                </span>
                <ArrowRight size={18} aria-hidden className="shrink-0 text-muted" />
              </Link>
            ) : (
              <Link
                to={`/${lesson.category}`}
                className="card flex items-center justify-end gap-3 p-4 text-right transition-colors hover:border-accent"
              >
                <span>
                  <span className="block text-xs text-muted">End of this track</span>
                  <span className="font-semibold">Back to {CATEGORY_TITLE[lesson.category]}</span>
                </span>
                <ArrowRight size={18} aria-hidden className="shrink-0 text-muted" />
              </Link>
            )}
          </nav>
        </footer>
      </article>

      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] self-start overflow-y-auto xl:block">
        <ContextPanel lesson={lesson} live={live} />
      </aside>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Lessons">
        <div onClick={(e) => (e.target as HTMLElement).closest('a') && setDrawerOpen(false)}>
          <CourseSidebar category={lesson.category} activeId={lesson.id} />
        </div>
      </Drawer>
    </div>
  );
}

export default function LessonPage({ category }: { category: Category }) {
  const { lessonId = '' } = useParams();
  const lesson = getLesson(lessonId);
  if (!lesson) return <NotFound />;
  if (lesson.category !== category) return <Navigate to={lessonPath(lesson)} replace />;
  // The key resets inputs, playback and quiz state when moving between lessons.
  return <LessonContent key={lesson.id} lesson={lesson} />;
}
