import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allLessons, defaultSteps } from '../../../lessons/all.testutil';
import type { View } from '../../../types/visualization';
import { StepView } from '.';

const draw = (view: View) => renderToString(<StepView view={view} />);

describe('every lesson draws', () => {
  // First and last steps only: drawing every step of every lesson takes about 40 seconds.
  it.each(allLessons.map((lesson) => [lesson.id, lesson] as const))('%s', (_, lesson) => {
    const steps = defaultSteps(lesson);
    const views = [steps[0]!.view, steps.at(-1)!.view, ...lesson.quiz.flatMap((q) => q.view ?? [])];
    for (const view of views) expect(draw(view)).not.toMatch(/NaN|undefined|\[object Object\]/);
  });
});
