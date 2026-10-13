import { Check, Minus, Plus, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Lesson } from '../../types/lesson';

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="mb-4 text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Concept({ lesson }: { lesson: Lesson }) {
  return (
    <div className="max-w-[68ch] space-y-4 text-[1.0625rem] leading-relaxed">
      {lesson.concept.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

export function HowItWorks({ lesson }: { lesson: Lesson }) {
  return (
    <ol className="max-w-[68ch] space-y-3">
      {lesson.howItWorks.map((step, i) => (
        <li key={step} className="flex gap-3.5 leading-relaxed">
          <span
            aria-hidden
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent"
          >
            {i + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function PointList({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <ul className="space-y-2 text-[0.9375rem] leading-relaxed">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span className="mt-1 shrink-0">{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TradeOffs({ lesson }: { lesson: Lesson }) {
  const { pros, cons, useWhen, avoidWhen } = lesson.prosCons;
  const plus = <Plus size={14} aria-hidden className="text-success" />;
  const minus = <Minus size={14} aria-hidden className="text-danger" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PointList title="Advantages" items={pros} icon={plus} />
      <PointList title="Disadvantages" items={cons} icon={minus} />
      <PointList title="Use it when" items={useWhen} icon={plus} />
      <PointList title="Avoid it when" items={avoidWhen} icon={minus} />
    </div>
  );
}

export function Applications({ lesson }: { lesson: Lesson }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {lesson.applications.map((item) => (
        <li key={item} className="card px-4 py-3.5 text-[0.9375rem] leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function CommonMistakes({ lesson }: { lesson: Lesson }) {
  return (
    <ul className="max-w-[68ch] space-y-3">
      {lesson.commonMistakes.map((item) => (
        <li key={item} className="flex gap-3 leading-relaxed">
          <TriangleAlert size={17} aria-hidden className="mt-1 shrink-0 text-danger" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Summary({ lesson }: { lesson: Lesson }) {
  return (
    <ul className="card max-w-[68ch] space-y-3 p-5">
      {lesson.summary.map((item) => (
        <li key={item} className="flex gap-3 leading-relaxed">
          <Check size={17} aria-hidden className="mt-1 shrink-0 text-success" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
