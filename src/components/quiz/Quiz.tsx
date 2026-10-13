import { CircleCheck, CircleX, RotateCcw, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useProgress } from '../../store/progress';
import type { QuizQuestion } from '../../types/lesson';
import { CodePanel } from '../code/CodePanel';
import { StepView } from '../visualization/renderers';

const TYPE_LABEL: Record<QuizQuestion['type'], string> = {
  'multiple-choice': 'Multiple choice',
  complexity: 'Complexity',
  code: 'Code',
  'predict-next': 'Predict the next step',
};

/** Option order is shuffled per attempt so the position never gives the answer away. */
function shuffledOrders(questions: QuizQuestion[]): number[][] {
  return questions.map((q) => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    return order;
  });
}

export function Quiz({ lessonId, questions }: { lessonId: string; questions: QuizQuestion[] }) {
  const recordQuiz = useProgress((s) => s.recordQuiz);
  const best = useProgress((s) => s.quizScores[lessonId]);
  const [orders, setOrders] = useState(() => shuffledOrders(questions));
  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<number>();
  // Only the first answer to each question counts toward the score.
  const [firstTry, setFirstTry] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);

  const question = questions[current]!;
  const order = orders[current]!;
  const answered = picked !== undefined;
  const correct = picked === question.answer;
  const score = firstTry.filter(Boolean).length;

  const pick = (option: number) => {
    if (answered) return;
    setPicked(option);
    if (firstTry[current] === undefined) {
      setFirstTry((list) => {
        const next = [...list];
        next[current] = option === question.answer;
        return next;
      });
    }
  };

  const next = () => {
    if (current < questions.length - 1) {
      setCurrent(current + 1);
      setPicked(undefined);
    } else {
      recordQuiz(lessonId, score, questions.length);
      setFinished(true);
    }
  };

  const restart = () => {
    setOrders(shuffledOrders(questions));
    setCurrent(0);
    setPicked(undefined);
    setFirstTry([]);
    setFinished(false);
  };

  if (finished) {
    const perfect = score === questions.length;
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <Trophy aria-hidden className={perfect ? 'text-accent' : 'text-muted'} size={28} />
        <p className="text-2xl font-semibold tracking-tight">
          {score} / {questions.length} correct
        </p>
        <p className="max-w-md text-muted">
          {perfect
            ? 'Perfect score. This lesson is now marked as complete.'
            : 'Review the explanations above, replay the visualization, and try again when you are ready.'}
        </p>
        <button type="button" className="btn mt-2" onClick={restart}>
          <RotateCcw size={16} aria-hidden /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
          {TYPE_LABEL[question.type]}
        </span>
        <span className="font-mono text-xs text-muted">
          Question {current + 1} / {questions.length}
          {best && ` · best ${best.correct}/${best.total}`}
        </span>
      </div>

      <p className="text-lg font-medium leading-snug">{question.prompt}</p>

      {question.view && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface-2/40">
          <div className="mx-auto w-max max-w-full px-6 py-8">
            <StepView view={question.view} />
          </div>
        </div>
      )}
      {question.code && (
        <div className="mt-4">
          <CodePanel code={question.code} />
        </div>
      )}

      <div role="group" aria-label="Answers" className="mt-5 grid gap-2">
        {order.map((option) => {
          const isAnswer = option === question.answer;
          const isPicked = option === picked;
          const state = !answered ? 'idle' : isAnswer ? 'right' : isPicked ? 'wrong' : 'dim';
          return (
            <button
              key={option}
              type="button"
              onClick={() => pick(option)}
              disabled={answered}
              aria-pressed={isPicked}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 px-4 py-2.5 text-left text-[0.9375rem] transition-colors ${
                state === 'idle'
                  ? 'border-border bg-surface hover:border-accent hover:bg-accent-soft'
                  : state === 'right'
                    ? 'border-success bg-surface font-medium'
                    : state === 'wrong'
                      ? 'border-danger bg-surface'
                      : 'border-border bg-surface opacity-55'
              }`}
            >
              <span className={question.type === 'complexity' ? 'font-mono' : ''}>{question.options[option]}</span>
              {state === 'right' && (
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-success">
                  <CircleCheck size={16} aria-hidden /> Correct answer
                </span>
              )}
              {state === 'wrong' && (
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-danger">
                  <CircleX size={16} aria-hidden /> Your answer
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div aria-live="polite">
        {answered && (
          <div className="mt-5 rounded-xl bg-surface-2 p-4">
            <p className={`flex items-center gap-2 font-semibold ${correct ? 'text-success' : 'text-danger'}`}>
              {correct ? <CircleCheck size={18} aria-hidden /> : <CircleX size={18} aria-hidden />}
              {correct ? 'Correct' : 'Not quite'}
            </p>
            <p className="mt-1.5 leading-relaxed">{question.explanation}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!correct && (
                <button type="button" className="btn" onClick={() => setPicked(undefined)}>
                  <RotateCcw size={16} aria-hidden /> Retry question
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={next}>
                {current < questions.length - 1 ? 'Next question' : 'See results'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
