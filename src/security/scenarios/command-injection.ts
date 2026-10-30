import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY, readBytes } from '../steps';
import { FILES_ROOT } from '../web/shell';
import { createShop, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf, type Story } from '../web/story';
import { createWorld, type World } from '../web/world';

export const commandInjectionCode = `function ping(host) {
  return shell('ping -c 1 ' + host)         // one string, read by a shell
}

function download(file) {
  return read(join('${FILES_ROOT}', file))
}

// Blocklist: refuse or strip what looks dangerous
if (host has ';' or '&&') return 400
file = file.replaceAll('../', '')

// No shell + allow-list: only known shapes get through
if (!isHostName(host)) return 400
run('ping', ['-c', '1', host])              // arguments, never parsed
path = resolve('${FILES_ROOT}', file)
if (!path.startsWith('${FILES_ROOT}/')) return 403`;

export const FEATURE_OPTIONS = ['Ping', 'Download'];

export const DEFENSE_OPTIONS = ['Shell string', 'Blocklist', 'No shell + allow-list'];

const COMMANDS: Record<string, ShopOptions['commands']> = { 'Shell string': 'shell', Blocklist: 'blocklist', 'No shell + allow-list': 'noShell' };

const REFUSAL_LINES: Record<string, string> = { 'Shell string': 'function ping', Blocklist: "if (host has ';'", 'No shell + allow-list': 'if (!isHostName(host)) return 400' };

/** The address bar leaves `%` alone, so the server decodes it once. Only what would end the value is escaped. */
const inAddress = (input: string) => input.replace(/[#&+ ]/g, (char) => encodeURIComponent(char));

type Run = { world: World; story: Story; input: string; defense: string };

const traced = (world: World) => world.site('shop').trace!;

function ping({ world, story, input, defense }: Run) {
  const answer = world.send({ method: 'GET', url: `${SHOP_ORIGIN}/ping?host=${encodeURIComponent(input)}`, headers: {}, body: {} }, 'attacker');
  const commands = traced(world);
  if (answer.status === 400) {
    story.step({ title: 'The shop checks the input first', why: 'Before any command runs, the shop compares the text with its rule.', next: 'Does this text pass?', line: REFUSAL_LINES[defense]!, text: { label: 'Checked', lines: { Input: input } } });
    story.step({ title: 'The shop refuses the input → 400', why: `${answer.body} It never reached a command.`, line: REFUSAL_LINES[defense]!, variables: { status: 400, result: 'stopped' } });
    return;
  }
  const extra = commands.length > 1;
  story.step({
    title: `The server ran ${commands.length} command${extra ? 's' : ''}`,
    why: extra ? 'The shell read the text as a small program. The input was meant to be one host name, and it added a command.' : 'One command, as the form intended.',
    next: 'What came back?',
    line: defense === 'No shell + allow-list' ? "run('ping', ['-c', '1', host])" : "return shell('ping -c 1 ' + host)",
    text: { label: 'On the server', lines: Object.fromEntries(commands.map((command, i) => [`${i + 1}`, command])) },
  });
  story.step({
    title: `Ping → ${answer.status}`,
    why: extra ? `The page shows: ${answer.body} The server ran this as the web app's own user, so anything that user may read is exposed.` : `The page shows: ${answer.body}`,
    line: 'function ping',
    variables: { status: answer.status, commands: commands.length, result: resultOf(extra) },
  });
}

function download({ world, story, input, defense }: Run) {
  const answer = world.send({ method: 'GET', url: `${SHOP_ORIGIN}/download?file=${inAddress(input)}`, headers: {}, body: {} }, 'attacker');
  const path = traced(world).at(-1)!;
  const outside = !path.startsWith(`${FILES_ROOT}/`);
  story.step({
    title: `The path resolved to ${path}`,
    why: outside ? `${path} is outside ${FILES_ROOT}. Each .. went up one folder.` : `${path} is inside ${FILES_ROOT}.`,
    next: 'Does the shop serve it?',
    line: defense === 'No shell + allow-list' ? "path = resolve('" : 'return read(join(',
    text: { label: 'On the server', lines: { Path: path } },
  });
  let why = `The page shows: ${answer.body}`;
  if (outside && answer.status === 200) why = `The page shows: ${answer.body} A download page has become a way to read any file the web app can read.`;
  if (outside && answer.status === 404) why = 'That path is outside the folder, and no file is there, so nothing came back.';
  if (answer.status === 403) why = `${answer.body} The shop works out the final path first, then checks that it is still inside the folder.`;
  story.step({
    title: `Download → ${answer.status}`,
    why,
    line: answer.status === 403 ? "if (!path.startsWith('" : 'return read(join(',
    variables: { status: answer.status, path, result: resultOf(outside && answer.status === 200) },
  });
}

const PLAY: Record<string, (run: Run) => void> = { Ping: ping, Download: download };

export function commandInjectionSteps(values: Record<string, string>): Step[] {
  const feature = readChoice(values, 'feature', 'Feature', FEATURE_OPTIONS);
  if (!feature.ok) return refusal('Cannot run this request', feature.why, EMPTY);
  const input = readBytes(values, 'input', 'Input', { min: 1, max: 120 });
  if (!input.ok) return refusal('Cannot run this request', input.why, EMPTY);
  const defense = readChoice(values, 'defense', 'Defense', DEFENSE_OPTIONS);
  if (!defense.ok) return refusal('Cannot run this request', defense.why, EMPTY);

  const world = createWorld([createShop({ commands: COMMANDS[defense.value]! })]);
  const story = createStory({ world, code: commandInjectionCode, nodes: ['attacker', 'shop'] });
  story.step({
    title: `${feature.value}, ${defense.value}`,
    why: `The input is "${input.value}". ${feature.value === 'Ping' ? 'The form asks for a host name to ping.' : 'The form asks for a file name in the downloads folder.'}`,
    next: 'Watch what the server makes of it.',
    line: feature.value === 'Ping' ? 'function ping' : 'function download',
  });
  PLAY[feature.value]!({ world, story, input: input.value, defense: defense.value });
  return story.steps;
}
