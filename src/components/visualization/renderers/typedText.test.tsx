import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { crossSiteScriptingSteps, DEFENSE_OPTIONS, WHERE_OPTIONS } from '../../../security/scenarios/cross-site-scripting';
import { StepView } from '.';

const PAYLOAD = '<img src=x onerror=alert(1)>';

/** Typed markup must reach the page as text, whatever the simulated browser did with it. */
describe('a typed payload on screen', () => {
  it.each(WHERE_OPTIONS.flatMap((where) => DEFENSE_OPTIONS.map((defense) => [where, defense] as const)))('%s with defense %s holds no live tag', (where, defense) => {
    const steps = crossSiteScriptingSteps({ where, input: PAYLOAD, defense });
    const html = steps.map((step) => renderToString(<StepView view={step.view} />)).join('');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<[a-z]+[^>]*\sonerror=/i);
  });

  it('shows the text escaped when encoding is off', () => {
    const steps = crossSiteScriptingSteps({ where: WHERE_OPTIONS[0]!, input: PAYLOAD, defense: DEFENSE_OPTIONS[0]! });
    expect(steps.map((step) => renderToString(<StepView view={step.view} />)).join('')).toContain('&lt;img');
  });
});
