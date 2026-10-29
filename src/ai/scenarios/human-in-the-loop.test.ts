import { describe, expect, it } from 'vitest';
import { humanInTheLoopSteps } from './human-in-the-loop';

const titles = (values: Record<string, string>) => humanInTheLoopSteps({ task: 'weather-compare', approval: 'risky', decision: 'approve', ...values }).map((s) => s.title);

describe('human-in-the-loop lesson', () => {
  it('pauses before the email, and a denial sends nothing', () => {
    const t = titles({ decision: 'deny' });
    expect(t).toContain('Ask the human before send_email: denied');
    expect(t.some((x) => x.startsWith('Call send_email'))).toBe(false);
    expect(t).toContain('Answer: "Tokyo is warmer (24°C vs 18°C). I did not email Sam: you denied it."');
  });

  it('sends without asking when approval is never needed', () => {
    const t = titles({ approval: 'never' });
    expect(t.some((x) => x.startsWith('Ask the human'))).toBe(false);
    expect(t.some((x) => x.startsWith('Call send_email'))).toBe(true);
  });

  it('asks before every tool when approval is every', () => {
    expect(titles({ approval: 'every' }).filter((x) => x.startsWith('Ask the human'))).toHaveLength(4);
  });

  it('refuses an unknown decision with one step', () => {
    expect(humanInTheLoopSteps({ task: 'cleanup', approval: 'risky', decision: 'maybe' })).toHaveLength(1);
  });
});
