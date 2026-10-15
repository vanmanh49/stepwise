import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BigOChart } from '../components/bigo/BigOChart';
import { COMPLEXITIES, curveForNotation, formatOps } from '../components/bigo/complexities';
import { lessonPath, lessonsIn } from '../lessons/registry';

export default function BigO() {
  const [size, setSize] = useState(50);

  useEffect(() => {
    document.title = 'Big O explorer — Stepwise';
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="eyebrow">Interactive explorer</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Big O notation</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Big O describes how the work an algorithm does grows as its input grows. It is not about seconds: it is about
          the shape of the curve. Move the slider and watch which curves stay flat and which ones run away.
        </p>
      </header>

      <section aria-label="Complexity chart" className="card mt-10 p-5 sm:p-7">
        <BigOChart size={size} onSizeChange={setSize} />
      </section>

      <section aria-labelledby="classes-title" className="mt-14">
        <h2 id="classes-title" className="mb-5 text-2xl font-semibold tracking-tight">
          What each class means
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {COMPLEXITIES.map((c) => (
            <li key={c.id} className="card p-5">
              <div className="flex items-center gap-3">
                <svg width="26" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="26" y2="4" stroke={c.color} strokeWidth="3" strokeDasharray={c.dash} />
                </svg>
                <h3 className="font-mono font-semibold">{c.label}</h3>
                <span className="text-sm text-muted">{c.name}</span>
              </div>
              <p className="mt-3 leading-relaxed">{c.meaning}</p>
              <p className="mt-2 text-sm text-muted">Example: {c.example}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="compare-title" className="mt-14">
        <h2 id="compare-title" className="text-2xl font-semibold tracking-tight">
          Compare the algorithms in this course
        </h2>
        <p className="mb-5 mt-2 text-muted">
          Roughly how many operations each needs for an input of size{' '}
          <span className="font-mono font-semibold text-text">n = {size}</span>. Change the slider above to update the
          table. For graph algorithms, n stands for nodes plus edges.
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="px-4 py-3 font-medium">
                  Algorithm
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Average
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Worst
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Average operations at n = {size}
                </th>
              </tr>
            </thead>
            <tbody>
              {lessonsIn('algorithms').map((lesson) => {
                const row = lesson.complexity!.rows[0]!;
                const curve = curveForNotation(row.average);
                return (
                  <tr key={lesson.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-3 font-medium">
                      <Link to={lessonPath(lesson)} className="hover:text-accent hover:underline">
                        {lesson.title}
                      </Link>
                    </th>
                    <td className="px-4 py-3 font-mono">{row.average}</td>
                    <td className="px-4 py-3 font-mono text-muted">{row.worst}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {curve ? `≈ ${formatOps(curve.fn(size))}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
