import { ArrowRight, CircleCheck, Flame } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { CATEGORY_TITLE } from '../components/navigation/CourseSidebar';
import { ProgressBar } from '../components/progress/ProgressBar';
import { getLesson, lessonPath, lessons, lessonsIn } from '../lessons/registry';
import { computeStreak, percent, useProgress } from '../store/progress';
import type { Category } from '../types/lesson';

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { completed, quizScores, currentLesson, activeDays, reset } = useProgress();

  useEffect(() => {
    document.title = 'Your progress — Stepwise';
  }, []);

  const doneLessons = lessons.filter((l) => completed.includes(l.id));
  const done = (category: Category) => lessonsIn(category).filter((l) => completed.includes(l.id)).length;
  const streak = computeStreak(activeDays);
  const scored = lessons.filter((l) => quizScores[l.id]);
  const quizCorrect = scored.reduce((sum, l) => sum + quizScores[l.id]!.correct, 0);
  const quizTotal = scored.reduce((sum, l) => sum + quizScores[l.id]!.total, 0);
  const resume = (currentLesson && getLesson(currentLesson)) || lessons.find((l) => !completed.includes(l.id));
  const started = completed.length > 0 || scored.length > 0 || currentLesson !== undefined;

  const confirmReset = () => {
    if (window.confirm('Reset all progress? Completed lessons, quiz scores and your streak will be cleared.')) reset();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your learning progress</h1>
        </div>
        {resume && (
          <Link to={lessonPath(resume)} className="btn btn-primary">
            {started ? 'Continue' : 'Start'}: {resume.title} <ArrowRight size={16} aria-hidden />
          </Link>
        )}
      </header>

      {!started && (
        <p className="card mt-8 p-5 text-muted">
          Nothing here yet. Open any lesson and your progress, quiz scores and streak will appear on this page. It is
          saved in this browser only.
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Overall" value={`${percent(doneLessons.length, lessons.length)}%`} note={`${doneLessons.length} of ${lessons.length} lessons`} />
        <Stat label="Lessons completed" value={String(doneLessons.length)} />
        <Stat
          label="Learning streak"
          value={`${streak} day${streak === 1 ? '' : 's'}`}
          note={streak > 0 ? 'Open a lesson each day to keep it going' : 'Open a lesson to start one'}
        />
        <Stat
          label="Quiz accuracy"
          value={quizTotal > 0 ? `${percent(quizCorrect, quizTotal)}%` : '—'}
          note={quizTotal > 0 ? `Best scores across ${scored.length} quiz${scored.length === 1 ? '' : 'zes'}` : 'No quizzes taken yet'}
        />
      </div>

      <section aria-labelledby="tracks-title" className="card mt-4 space-y-6 p-6">
        <h2 id="tracks-title" className="text-lg font-semibold">
          Tracks
        </h2>
        {(['data-structures', 'algorithms', 'sql'] as const).map((category) => (
          <ProgressBar
            key={category}
            label={CATEGORY_TITLE[category]}
            value={percent(done(category), lessonsIn(category).length)}
            detail={`${done(category)} / ${lessonsIn(category).length} · ${percent(done(category), lessonsIn(category).length)}%`}
          />
        ))}
      </section>

      <section aria-labelledby="lessons-title" className="mt-12">
        <h2 id="lessons-title" className="mb-4 text-lg font-semibold">
          Lessons and quiz scores
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="px-4 py-3 font-medium">
                  Lesson
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Track
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Best quiz score
                </th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson) => {
                const score = quizScores[lesson.id];
                const isDone = completed.includes(lesson.id);
                return (
                  <tr key={lesson.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 font-medium">
                      <Link to={lessonPath(lesson)} className="hover:text-accent hover:underline">
                        {lesson.title}
                      </Link>
                    </th>
                    <td className="px-4 py-3 text-muted">{CATEGORY_TITLE[lesson.category]}</td>
                    <td className="px-4 py-3">
                      {isDone ? (
                        <span className="inline-flex items-center gap-1 font-medium text-success">
                          <CircleCheck size={15} aria-hidden /> Completed
                        </span>
                      ) : (
                        <span className="text-muted">{lesson.id === currentLesson ? 'In progress' : 'Not started'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">{score ? `${score.correct} / ${score.total}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {started && (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Flame size={15} aria-hidden /> Progress is stored in this browser.
          </p>
          <button type="button" className="btn text-danger" onClick={confirmReset}>
            Reset progress
          </button>
        </div>
      )}
    </div>
  );
}
