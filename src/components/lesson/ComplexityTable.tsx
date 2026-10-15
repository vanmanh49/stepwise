import { Link } from 'react-router';
import { getLesson, lessonPath } from '../../lessons/registry';
import type { Lesson } from '../../types/lesson';

/** The lesson's own complexity rows, followed by related lessons for comparison. */
export function ComplexityTable({ lesson }: { lesson: Lesson }) {
  const complexity = lesson.complexity;
  if (!complexity) return null;
  const compared = (lesson.compareWith ?? [])
    .map(getLesson)
    .filter((other): other is Lesson => other?.complexity !== undefined && other.category === lesson.category);
  const isAlgorithm = lesson.category === 'algorithms';

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[30rem] text-left text-sm">
        <caption className="sr-only">Time and space complexity of {lesson.title}</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th scope="col" className="px-4 py-3 font-medium">
              {isAlgorithm ? 'Algorithm' : 'Operation'}
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Best
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Average
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Worst
            </th>
            {isAlgorithm && (
              <th scope="col" className="px-4 py-3 font-medium">
                Space
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {complexity.rows.map((row) => (
            <tr key={row.label} className="border-b border-border bg-accent-soft/50 last:border-0">
              <th scope="row" className="px-4 py-3 font-semibold">
                {row.label}
              </th>
              <td className="px-4 py-3 font-mono">{row.best}</td>
              <td className="px-4 py-3 font-mono">{row.average}</td>
              <td className="px-4 py-3 font-mono">{row.worst}</td>
              {isAlgorithm && <td className="px-4 py-3 font-mono">{complexity.space}</td>}
            </tr>
          ))}
          {isAlgorithm &&
            compared.map((other) => {
              const row = other.complexity!.rows[0]!;
              return (
                <tr key={other.id} className="border-b border-border last:border-0">
                  <th scope="row" className="px-4 py-3 font-medium">
                    <Link to={lessonPath(other)} className="underline decoration-border underline-offset-4 hover:text-accent">
                      {other.title}
                    </Link>
                  </th>
                  <td className="px-4 py-3 font-mono text-muted">{row.best}</td>
                  <td className="px-4 py-3 font-mono text-muted">{row.average}</td>
                  <td className="px-4 py-3 font-mono text-muted">{row.worst}</td>
                  <td className="px-4 py-3 font-mono text-muted">{other.complexity!.space}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
