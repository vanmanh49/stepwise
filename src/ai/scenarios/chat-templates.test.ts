import { describe, expect, it } from 'vitest';
import type { ArrayView, PanelsView } from '../../types/visualization';
import { chatTemplatesSteps } from './chat-templates';

const defaults = { system: 'helpful', user: 'hello', generationPrompt: 'on' };
const stream = (view: PanelsView) => (view.panels[0]!.view as ArrayView).cells.map((c) => c.value);

describe('chat templates lesson', () => {
  it('shows the reply after the assistant marker', () => {
    const last = chatTemplatesSteps(defaults).at(-1)!;
    expect(last.view.kind).toBe('panels');
    const tokens = stream(last.view as PanelsView);
    expect(tokens.indexOf('<|assistant|>')).toBeGreaterThan(tokens.lastIndexOf('<|end|>', tokens.indexOf('<|assistant|>')));
    expect(tokens.slice(tokens.indexOf('<|assistant|>') + 1).join(' ')).toContain('Hello!');
  });

  it("keeps writing the user's message without a generation prompt", () => {
    const last = chatTemplatesSteps({ ...defaults, generationPrompt: 'off' }).at(-1)!;
    expect(last.title).toContain("kept writing the user's message");
    expect(stream(last.view as PanelsView)).not.toContain('<|assistant|>');
  });

  it('adds no system tokens when there is no system prompt', () => {
    const steps = chatTemplatesSteps({ ...defaults, system: 'none' });
    expect(stream(steps.at(-1)!.view as PanelsView)[0]).toBe('<|user|>');
  });

  it('refuses an unknown system prompt with one step', () => {
    expect(chatTemplatesSteps({ ...defaults, system: 'evil' })).toHaveLength(1);
  });
});
