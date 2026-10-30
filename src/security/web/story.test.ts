import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, ServicesView } from '../../types/visualization';
import { MAX_STEPS } from '../steps';
import { createEvil } from './evil';
import { createInternal } from './internal';
import { createLogin, LOGIN_ORIGIN } from './login';
import { createShop, SHOP_ORIGIN } from './shop';
import { cookieGrid, createStory, resultOf, rowsGrid, textGrid, type NodeId } from './story';
import { createWorld } from './world';

const CODE = 'first line\nsecond line';

function setup(nodes: NodeId[] = ['browser', 'attacker', 'shop', 'db']) {
  const world = createWorld([createShop(), createLogin(), createEvil()]);
  return { world, story: createStory({ world, code: CODE, nodes }) };
}

const panels = (view: unknown) => (view as PanelsView).panels;
const wire = (view: unknown) => panels(view)[0]!.view as ServicesView;

describe('a story step', () => {
  it('draws the events since the last step, labelled with method and path', () => {
    const { world, story } = setup();
    world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: 'alice', password: 'sunshine' });
    story.step({ title: 'Sign in', why: 'Because.', line: 'first' });
    const view = wire(story.steps[0]!.view);
    expect(view.messages.map((m) => [m.from, m.to, m.label])).toEqual([['browser', 'shop', 'POST /signin']]);
    expect(view.log).toEqual(['POST /signin → 200']);
  });

  it('marks a refused request', () => {
    const { world, story } = setup();
    world.browser.visit(`${SHOP_ORIGIN}/account`);
    story.step({ title: 'Refused', why: 'Because.', line: 'first' });
    expect(wire(story.steps[0]!.view).messages[0]!.role).toBe('discarded');
  });

  it('draws nothing when nothing was sent', () => {
    const { world, story } = setup();
    world.browser.visit(`${SHOP_ORIGIN}/account`);
    story.step({ title: 'One', why: 'Because.', line: 'first' });
    story.step({ title: 'Two', why: 'Because.', line: 'first' });
    expect(wire(story.steps[1]!.view).messages).toEqual([]);
  });

  it('leaves out parties that are not drawn', () => {
    const { world, story } = setup(['browser', 'shop']);
    world.browser.submit(`${LOGIN_ORIGIN}/signin`, {});
    story.step({ title: 'Elsewhere', why: 'Because.', line: 'first' });
    expect(wire(story.steps[0]!.view).messages).toEqual([]);
  });

  it('skips a request to a host that does not exist', () => {
    const { world, story } = setup();
    world.browser.visit('https://nowhere.example/');
    story.step({ title: 'Lost', why: 'Because.', line: 'first' });
    expect(wire(story.steps[0]!.view).messages).toEqual([]);
  });

  it('keeps every message on a drawn link', () => {
    const { world, story } = setup(['browser', 'attacker', 'evil', 'shop', 'login', 'db']);
    world.browser.submit(`${LOGIN_ORIGIN}/signin`, { name: 'alice', password: 'sunshine' });
    world.browser.visit(`${SHOP_ORIGIN}/signin/provider`);
    world.browser.visit('https://evil.example/cb?code=1');
    world.send({ method: 'GET', url: `${SHOP_ORIGIN}/account`, headers: {}, body: {} }, 'attacker');
    story.step({ title: 'All', why: 'Because.', line: 'first', note: { from: 'attacker', to: 'db', label: 'copies the table' } });
    const view = wire(story.steps[0]!.view);
    expect(view.messages.length).toBeGreaterThan(5);
    const linked = (from: string, to: string) => view.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
    for (const message of view.messages) expect(linked(message.from, message.to), `${message.from} ${message.to}`).toBe(true);
  });

  it('adds a note for something that is not a request', () => {
    const { story } = setup();
    story.step({ title: 'Leak', why: 'Because.', line: 'first', note: { from: 'attacker', to: 'db', label: 'copies the table' } });
    expect(wire(story.steps[0]!.view).messages.map((m) => m.label)).toEqual(['copies the table']);
  });

  it('gives every message its own id across a step', () => {
    const { world, story } = setup();
    world.browser.visit(`${SHOP_ORIGIN}/account`);
    world.browser.visit(`${SHOP_ORIGIN}/account`);
    story.step({ title: 'Two', why: 'Because.', line: 'first', note: { from: 'attacker', to: 'db', label: 'note' } });
    const ids = wire(story.steps[0]!.view).messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('shows the cookies, and rows when given', () => {
    const { world, story } = setup();
    world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: 'alice', password: 'sunshine' });
    story.step({ title: 'No rows', why: 'Because.', line: 'first' });
    story.step({ title: 'Rows', why: 'Because.', line: 'first', rows: rowsGrid(world.site('shop').db!.rows('sessions'), 'sessions') });
    expect(panels(story.steps[0]!.view).map((p) => p.label)).toEqual(['On the wire', 'Cookies']);
    expect(panels(story.steps[1]!.view).map((p) => p.label)).toEqual(['On the wire', 'Cookies', 'Rows']);
  });

  it('turns line text into a line number, and throws on an unknown one', () => {
    const { story } = setup();
    story.step({ title: 'Two', why: 'Because.', line: 'second' });
    expect(story.steps[0]!.codeLine).toBe(2);
    expect(() => story.step({ title: 'None', why: 'Because.', line: 'missing' })).toThrow('no line containing');
  });

  it('keeps next and variables', () => {
    const { story } = setup();
    story.step({ title: 'Two', why: 'Because.', next: 'Then.', line: 'first', variables: { result: 'stopped' } });
    expect(story.steps[0]).toMatchObject({ next: 'Then.', variables: { result: 'stopped' } });
  });

  it('stops at MAX_STEPS', () => {
    const { story } = setup();
    for (let i = 0; i < MAX_STEPS + 5; i++) story.step({ title: 'Again', why: 'Because.', line: 'first' });
    expect(story.steps).toHaveLength(MAX_STEPS);
  });
});

describe('cookieGrid', () => {
  it('spells out each flag', () => {
    const { world } = setup();
    world.browser.submit(`${SHOP_ORIGIN}/signin`, { name: 'alice', password: 'sunshine' });
    const grid: GridView = cookieGrid(world);
    expect(grid.colLabels).toEqual(['Name', 'Value', 'Flags']);
    expect(grid.rows[0]!.cells[2]!.value).toBe('HttpOnly, Secure, Lax');
  });

  it('shortens a long value', () => {
    const { world } = setup();
    world.browser.plant(`${SHOP_ORIGIN}/`, { name: 'sid', value: 'a'.repeat(40) });
    expect(cookieGrid(world).rows[0]!.cells[1]!.value).toBe(`${'a'.repeat(12)}…`);
  });

  it('says when the jar is empty', () => {
    const { world } = setup();
    expect(cookieGrid(world).rows[0]!.cells[0]!.value).toBe('No cookies');
  });

  it('gives same-named cookies on two hosts their own ids', () => {
    const { world } = setup();
    world.browser.plant(`${SHOP_ORIGIN}/`, { name: 'a', value: '1' });
    world.browser.plant(`${LOGIN_ORIGIN}/`, { name: 'a', value: '2' });
    const ids = cookieGrid(world).rows.flatMap((r) => r.cells.map((c) => c!.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('rowsGrid', () => {
  it('uses the keys as column labels', () => {
    const grid = rowsGrid([{ id: 1, name: 'alice' }], 'users');
    expect(grid.colLabels).toEqual(['id', 'name']);
    expect(grid.rows[0]!.cells.map((c) => c!.value)).toEqual(['1', 'alice']);
  });

  it('says when there are no rows', () => {
    expect(rowsGrid([], 'users').rows[0]!.cells[0]!.value).toBe('No rows');
  });
});

describe('resultOf', () => {
  it('names the two outcomes', () => {
    expect(resultOf(true)).toBe('attacker in');
    expect(resultOf(false)).toBe('stopped');
  });
});

describe('the inside of the network', () => {
  it('draws the shop asking the internal site', () => {
    const world = createWorld([createShop({ preview: 'open' }), createInternal()]);
    const story = createStory({ world, code: CODE, nodes: ['browser', 'shop', 'internal'] });
    world.browser.visit(`${SHOP_ORIGIN}/preview?url=http://metadata.internal/latest/credentials`);
    story.step({ title: 'Preview', why: 'Because.', line: 'first' });
    expect(wire(story.steps[0]!.view).messages.map((m) => [m.from, m.to])).toEqual([['browser', 'shop'], ['shop', 'internal']]);
  });
});

describe('textGrid', () => {
  it('gives each line a label and one cell', () => {
    const grid = textGrid({ Query: 'SELECT 1', Result: 'none' }, 'lines');
    expect(grid.rows.map((row) => [row.label, row.cells[0]!.value])).toEqual([['Query', 'SELECT 1'], ['Result', 'none']]);
    expect(new Set(grid.rows.map((row) => row.cells[0]!.id)).size).toBe(2);
  });
});

describe('a step with text panels', () => {
  it('draws each after the rows', () => {
    const { story } = setup();
    story.step({ title: 'T', why: 'W', line: 'first', rows: rowsGrid([], 'r'), text: { label: 'Query', lines: { Sent: 'SELECT 1' } } });
    expect(panels(story.steps[0]!.view).map((panel) => panel.label)).toEqual(['On the wire', 'Cookies', 'Query', 'Rows']);
  });
});
