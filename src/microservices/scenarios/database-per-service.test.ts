import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { databasePerServiceScenario, databasePerServiceSteps } from './database-per-service';

const outcomes = (values: Record<string, string>) => {
  const read = databasePerServiceScenario(values);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests;
};

describe('Database per Service', () => {
  it("breaks orders' query when the users team renames a column in the shared database", () => {
    const requests = outcomes({ model: 'shared', rename: 'yes' });
    expect(requests.map((r) => [r.status, r.reason])).toEqual([
      ['ok', undefined],
      ['ok', undefined],
      ['failed', 'no column users.name'],
      ['failed', 'no column users.name'],
    ]);
  });

  it('keeps every request working when each service owns its data', () => {
    expect(outcomes({ model: 'per-service', rename: 'yes' }).every((r) => r.status === 'ok')).toBe(true);
  });

  it('pays one more hop for asking the users service', () => {
    const [shared] = outcomes({ model: 'shared', rename: 'no' });
    const [owned] = outcomes({ model: 'per-service', rename: 'no' });
    expect(owned!.ms).toBeGreaterThan(shared!.ms);
    expect(owned!.crossServiceCalls).toBe(1);
    expect(shared!.crossServiceCalls).toBe(0);
  });

  it('refuses an unknown data model', () => {
    expect(databasePerServiceSteps({ model: 'both', rename: 'yes' })).toHaveLength(1);
  });
});
