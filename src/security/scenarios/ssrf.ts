import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY, readBytes } from '../steps';
import { createEvil } from '../web/evil';
import { createImages, createInternal } from '../web/internal';
import { createShop, SHOP_ORIGIN, type ShopOptions } from '../web/shop';
import { createStory, resultOf } from '../web/story';
import { createWorld } from '../web/world';

export const ssrfCode = `function preview(url) {
  if (blocklist && host(url) in ['localhost', '127.0.0.1', '169.254.169.254']) return 403
  if (allowList && host(url) != 'images.example') return 403
  answer = fetch(url)                      // from inside the network
  while (answer.isRedirect && !allowList) answer = fetch(answer.location)
  return answer.body
}`;

export const DEFENSE_OPTIONS = ['None', 'Blocklist', 'Allow-list'];

const PREVIEW: Record<string, ShopOptions['preview']> = { None: 'open', Blocklist: 'blocklist', 'Allow-list': 'allowList' };

export function ssrfSteps(values: Record<string, string>): Step[] {
  const input = readBytes(values, 'input', 'Address', { min: 1, max: 120 });
  if (!input.ok) return refusal('Cannot run this', input.why, EMPTY);
  const defense = readChoice(values, 'defense', 'Defense', DEFENSE_OPTIONS);
  if (!defense.ok) return refusal('Cannot run this', defense.why, EMPTY);

  const world = createWorld([createShop({ preview: PREVIEW[defense.value]! }), createEvil(), createInternal(), createImages()]);
  const story = createStory({ world, code: ssrfCode, nodes: ['attacker', 'shop', 'evil', 'images', 'internal'] });
  story.step({ title: `Preview, defense: ${defense.value}`, why: `The shop can fetch a picture from an address and show it. Someone gives it ${input.value}.`, next: 'The shop fetches it, from where the shop sits.', line: 'function preview' });

  const answer = world.send({ method: 'GET', url: `${SHOP_ORIGIN}/preview?url=${encodeURIComponent(input.value)}`, headers: {}, body: {} }, 'attacker');
  const hops = world.events.filter((event) => event.from === 'shop');
  const reached = hops.some((event) => event.to === 'internal' && event.response.status === 200);

  if (hops.length === 0) {
    story.step({ title: 'The shop checks the address first', why: 'The check runs before any request, on the address as written.', next: 'Does this address pass?', line: defense.value === 'Allow-list' ? 'if (allowList' : 'if (blocklist', text: { label: 'Checked', lines: { Address: input.value } } });
    story.step({ title: `The shop refuses → ${answer.status}`, why: `${answer.body} No request left the shop.${defense.value === 'Allow-list' ? ' The allow-list names the one host a preview may use, so nothing else needs thinking about.' : ''}`, line: defense.value === 'Allow-list' ? 'if (allowList' : 'if (blocklist', variables: { status: answer.status, result: 'stopped' } });
    return story.steps;
  }

  story.step({
    title: `The shop made ${hops.length} request${hops.length === 1 ? '' : 's'}`,
    why: hops.length > 1 ? `The first answer was a redirect, and the shop followed it. The check only read the first address, so the second was never checked: ${hops.map((hop) => hop.request.url).join(' → ')}.` : `The shop asked ${hops[0]!.request.url} itself, from inside the network.`,
    next: 'What came back?',
    line: hops.length > 1 ? 'while (answer.isRedirect' : 'answer = fetch(url)',
    text: { label: 'Requests from the shop', lines: Object.fromEntries(hops.map((hop, i) => [`${i + 1}`, `${hop.request.url} → ${hop.response.status}`])) },
  });

  let why = `The preview shows: ${answer.body}`;
  if (reached) why = `The preview shows: ${answer.body} No one outside can reach that host, but the shop can, so the shop fetched what is there and handed it over.`;
  if (answer.status === 502) {
    const redirected = hops.at(-1)!.response.redirect !== undefined;
    const reason = defense.value === 'Allow-list' ? 'The address was allowed, but it answered with a redirect, and the allow-list follows no redirects.' : 'The shop gave up after too many redirects.';
    why = `${answer.body} ${redirected ? reason : 'The simulation has no such host: nothing here can leave for a real site.'}`;
  }
  story.step({ title: `Preview → ${answer.status}`, why, line: answer.status === 200 ? 'return answer.body' : 'answer = fetch(url)', variables: { status: answer.status, result: resultOf(reached) } });
  return story.steps;
}
