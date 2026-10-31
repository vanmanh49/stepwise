import { ArrowLeft, ArrowRight, CircleCheck, Menu, TriangleAlert } from 'lucide-react';
import { Component, Suspense, use, useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { CourseSidebar } from '../components/navigation/CourseSidebar';
import { CATEGORY_TITLE } from '../lessons/labels';
import { Drawer } from '../components/navigation/Drawer';
import { Button } from '../components/ui/Button';
import { Quiz } from '../components/quiz/Quiz';
import { Exercises } from '../components/sql/Exercises';
import { Variables } from '../components/visualization/Explanation';
import { LessonVisualization } from '../components/visualization/inputs/LessonVisualization';
import { adjacentLessons, getLesson, LessonLoadError, lessonPath, loadLesson } from '../lessons/registry';
import { useLiveStep } from '../store/liveStep';
import { useProgress } from '../store/progress';
import type { Category, Lesson, LessonMeta } from '../types/lesson';
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

const CODE_COPY: Record<Category, { title: string; label?: string; intro: string }> = {
  sql: {
    title: 'Example query',
    label: 'SQL',
    intro: 'The query this lesson starts with. In the visualization above, the highlighted line follows the clause that is running.',
  },
  microservices: {
    title: 'Pseudocode',
    label: 'Pseudocode',
    intro: 'The decisions the simulated services make, as short pseudocode. In the visualization above, the highlighted line follows the event that is happening.',
  },
  kubernetes: {
    title: 'Pseudocode',
    label: 'Pseudocode',
    intro: 'The decisions the simulated cluster makes, as short pseudocode. In the visualization above, the highlighted line follows the component that is acting.',
  },
  ai: {
    title: 'Pseudocode',
    label: 'Pseudocode',
    intro: 'The steps the tiny model takes, as short pseudocode. In the visualization above, the highlighted line follows the step that is running.',
  },
  security: {
    title: 'Pseudocode',
    label: 'Pseudocode',
    intro: 'The steps the algorithm takes, as short pseudocode. In the visualization above, the highlighted line follows the step that is running.',
  },
  'data-structures': { title: 'Code', intro: 'The full TypeScript implementation. In the visualization above, the highlighted line follows this code as each step runs.' },
  algorithms: { title: 'Code', intro: 'The full TypeScript implementation. In the visualization above, the highlighted line follows this code as each step runs.' },
};

/** The page sections a lesson shows: SQL, Microservices and Kubernetes lessons have no complexity, and each category names its code. */
function sectionsFor(lesson: Lesson): (readonly [string, string])[] {
  return SECTIONS.filter(([id]) => id !== 'complexity' || lesson.complexity).map(([id, title]) =>
    id === 'code' ? ([id, CODE_COPY[lesson.category].title] as const) : ([id, title] as const),
  );
}

/** The only part of the page that follows the visualization step by step. */
function NowRunning() {
  const live = useLiveStep((s) => s.live);
  return (
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
  );
}

function ContextPanel({ lesson }: { lesson: Lesson }) {
  return (
    <div className="flex flex-col gap-6 text-sm">
      <NowRunning />

      {lesson.complexity && (
        <div>
          <p className="eyebrow">Complexity</p>
          <dl className="mt-2 space-y-1.5">
            {(
              [
                [lesson.category === 'algorithms' ? 'Average time' : lesson.complexity.rows[0]!.label, lesson.complexity.rows[0]!.average],
                ['Worst case', lesson.complexity.rows[0]!.worst],
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
      )}

      <nav aria-label="On this page">
        <p className="eyebrow">On this page</p>
        <ul className="mt-2 space-y-0.5">
          {sectionsFor(lesson).map(([id, title]) => (
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

/** The page around a lesson, shared by the loaded lesson and its loading and failure states. */
function LessonFrame({
  meta,
  status,
  intro,
  aside,
  children,
}: {
  meta: LessonMeta;
  /** Shown beside the title. */
  status?: ReactNode;
  intro: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.title = `${meta.title} — Stepwise`;
  }, [meta]);

  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:py-10 xl:grid-cols-[230px_minmax(0,1fr)_230px]">
      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] self-start overflow-y-auto pr-1 lg:block">
        <CourseSidebar category={meta.category} activeId={meta.id} />
      </aside>

      {/* Long words such as requiredDuringScheduling… must wrap, or they widen the whole page on a phone. */}
      <article className="min-w-0 space-y-14 [overflow-wrap:break-word]">
        <header className="space-y-4">
          <div className="flex items-center gap-3 lg:hidden">
            <Button icon={Menu} onClick={() => setDrawerOpen(true)}>
              Lessons
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link to={`/${meta.category}`} className="hover:text-text">
              {CATEGORY_TITLE[meta.category]}
            </Link>
            {meta.group && (
              <>
                <span aria-hidden>/</span>
                <span>{meta.group}</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{meta.title}</h1>
            <DifficultyBadge difficulty={meta.difficulty} />
            {status}
          </div>
          {intro}
        </header>
        {children}
      </article>

      {aside && <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] self-start overflow-y-auto xl:block">{aside}</aside>}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Lessons">
        <div onClick={(e) => (e.target as HTMLElement).closest('a') && setDrawerOpen(false)}>
          <CourseSidebar category={meta.category} activeId={meta.id} />
        </div>
      </Drawer>
    </div>
  );
}

function LessonBody({ lesson }: { lesson: Lesson }) {
  const visit = useProgress((s) => s.visit);
  const isComplete = useProgress((s) => s.completed.includes(lesson.id));
  const markComplete = useProgress((s) => s.markComplete);
  const unmarkComplete = useProgress((s) => s.unmarkComplete);
  const { prev, next } = adjacentLessons(lesson.id);

  useEffect(() => {
    visit(lesson.id);
  }, [lesson, visit]);

  // Fetch the next lesson in the background so "Next lesson" opens without waiting.
  useEffect(() => {
    if (next) loadLesson(next.id).catch(() => {});
  }, [next]);

  // Steps go to the store, not this component's state. Clear it only when the lesson goes away: the
  // visualization (a child, whose effects run first) has already reported step 0 when this mounts.
  useEffect(() => () => useLiveStep.getState().set(undefined), []);
  const onStep = useCallback((step: Step, index: number, total: number) => useLiveStep.getState().set({ step, index, total }), []);

  return (
    <LessonFrame
      meta={lesson}
      status={
        isComplete && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
            <CircleCheck size={16} aria-hidden /> Completed
          </span>
        )
      }
      intro={
        <>
          <p className="max-w-[68ch] text-lg leading-relaxed text-muted">{lesson.overview}</p>
          <PrerequisiteNotice lesson={lesson} />
        </>
      }
      aside={<ContextPanel lesson={lesson} />}
    >
        <Section id="visualization" title="See it run">
          <LessonVisualization config={lesson.visualization} code={lesson.code} onStep={onStep} />
        </Section>

        <Section id="concept" title="The idea">
          <Concept lesson={lesson} />
        </Section>

        <Section id="how-it-works" title="How it works">
          <HowItWorks lesson={lesson} />
        </Section>

        <Section id="code" title={CODE_COPY[lesson.category].title}>
          <p className="mb-4 max-w-[68ch] text-muted">{CODE_COPY[lesson.category].intro}</p>
          <CodePanel code={lesson.code} label={CODE_COPY[lesson.category].label} />
        </Section>

        {lesson.complexity && (
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
        )}

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
          {lesson.visualization.kind === 'sql' && (
            <div className="mb-10">
              <h3 className="mb-4 text-lg font-semibold">Write the query</h3>
              <Exercises lessonId={lesson.id} dataset={lesson.visualization.dataset} exercises={lesson.visualization.exercises} />
            </div>
          )}
          <Quiz lessonId={lesson.id} questions={lesson.quiz} codeLabel={CODE_COPY[lesson.category].label} />
        </Section>

        <Section id="summary" title="Summary">
          <Summary lesson={lesson} />
        </Section>

        <footer className="space-y-6 border-t border-border pt-8">
          <Button
            variant={isComplete ? 'default' : 'primary'}
            icon={CircleCheck}
            iconSize={17}
            onClick={() => (isComplete ? unmarkComplete(lesson.id) : markComplete(lesson.id))}
            aria-pressed={isComplete}
          >
            {isComplete ? 'Completed — mark as not done' : 'Mark as complete'}
          </Button>
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
    </LessonFrame>
  );
}

export default function LessonPage({ category }: { category: Category }) {
  const { lessonId = '' } = useParams();
  const lesson = getLesson(lessonId);
  if (!lesson) return <NotFound />;
  if (lesson.category !== category) return <Navigate to={lessonPath(lesson)} replace />;
  // The key resets inputs, playback, quiz state and a failed load when moving between lessons.
  return (
    <LessonLoadBoundary key={lesson.id} meta={lesson}>
      <Suspense
        fallback={
          <LessonFrame
            meta={lesson}
            intro={
              <p role="status" className="text-lg text-muted">
                Loading lesson…
              </p>
            }
          />
        }
      >
        <LoadedLesson meta={lesson} />
      </Suspense>
    </LessonLoadBoundary>
  );
}

/**
 * Catches a lesson that can't be downloaded (for example while offline) or that fails while
 * showing, and offers a reload. Browsers remember a failed import() of a chunk and won't fetch it
 * again, so a reload is the only reliable retry.
 */
class LessonLoadBoundary extends Component<{ meta: LessonMeta; children: ReactNode }, { failure?: 'download' | 'render' }> {
  state: { failure?: 'download' | 'render' } = {};

  static getDerivedStateFromError(error: unknown) {
    return { failure: error instanceof LessonLoadError ? 'download' : 'render' };
  }

  render() {
    const { failure } = this.state;
    if (!failure) return this.props.children;
    return (
      <LessonFrame
        meta={this.props.meta}
        intro={
          <div role="alert" className="card flex flex-col items-start gap-3 p-6">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert size={18} aria-hidden className="text-danger" />
              {failure === 'download' ? "This lesson couldn't be downloaded." : 'Something went wrong while showing this lesson.'}
            </p>
            <Button onClick={() => window.location.reload()}>{failure === 'download' ? 'Try again' : 'Reload page'}</Button>
          </div>
        }
      />
    );
  }
}

/** Suspends until the lesson's content has loaded; loadLesson returns the same promise per id. */
function LoadedLesson({ meta }: { meta: LessonMeta }) {
  const lesson = use(loadLesson(meta.id));
  return <LessonBody lesson={lesson} />;
}
