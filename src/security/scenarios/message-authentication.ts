import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { PanelsView, Step } from '../../types/visualization';
import { concat, hex, utf8 } from '../crypto/bytes';
import { hmac, hmacParts } from '../crypto/hmac';
import { padding, resume, sha256 } from '../crypto/sha256';
import { byteGrid, EMPTY, readBytes } from '../steps';

export const messageAuthenticationCode = `function tag(key, message) {
  if (scheme == "naive") return sha256(key + message)
  inner = sha256((key ^ ipad) + message)
  return sha256((key ^ opad) + inner)
}

// the attacker sees message and sentTag, but never the key
glue = padding(key.length + message.length)
forged = message + glue + extension
forgedTag = sha256Resume(sentTag, extension)

// the server recomputes the tag with its key
accepted = tag(key, forged) == forgedTag`;

export const SCHEMES = ['SHA-256(key + message)', 'HMAC'];
export const MAX_KEY = 16;
export const MAX_MESSAGE = 32;
export const MAX_EXTENSION = 16;

const line = (snippet: string) => lineOf(messageAuthenticationCode, snippet);
const short = (bytes: Uint8Array) => `${hex(bytes).slice(0, 16)}…`;

const pair = (labelA: string, a: PanelsView['panels'][number]['view'], labelB: string, b: PanelsView['panels'][number]['view']): PanelsView => ({
  kind: 'panels',
  panels: [
    { label: labelA, view: a },
    { label: labelB, view: b },
  ],
});

const TITLE = "Can't run this scenario";

export function messageAuthenticationSteps(values: Record<string, string>): Step[] {
  const scheme = readChoice(values, 'scheme', 'Scheme', SCHEMES);
  if (!scheme.ok) return refusal(TITLE, scheme.why, EMPTY);
  const keyText = readBytes(values, 'key', 'Key', { min: 1, max: MAX_KEY });
  if (!keyText.ok) return refusal(TITLE, keyText.why, EMPTY);
  const messageText = readBytes(values, 'message', 'Message', { min: 1, max: MAX_MESSAGE });
  if (!messageText.ok) return refusal(TITLE, messageText.why, EMPTY);
  const extensionText = readBytes(values, 'extension', 'Extension', { min: 1, max: MAX_EXTENSION });
  if (!extensionText.ok) return refusal(TITLE, extensionText.why, EMPTY);

  const naive = scheme.value === SCHEMES[0];
  const key = utf8(keyText.value);
  const message = utf8(messageText.value);
  const extension = utf8(extensionText.value);
  const sign = (bytes: Uint8Array) => (naive ? sha256(concat(key, bytes)) : hmac(key, bytes));
  const sentTag = sign(message);

  const steps: Step[] = [];
  if (naive) {
    steps.push({
      title: `Server tags "${messageText.value}" with SHA-256(key + message)`,
      why: `The tag is ${short(sentTag)}. Only someone with the key should be able to make a tag like this.`,
      next: 'The message and tag travel in the open.',
      codeLine: line('return sha256(key + message)'),
      variables: { tag: short(sentTag) },
      view: pair('Message', byteGrid(message, 'message'), 'Tag', byteGrid(sentTag, 'tag', () => 'found')),
    });
  } else {
    const parts = hmacParts(key, message);
    steps.push(
      {
        title: `Server computes the inner hash of "${messageText.value}"`,
        why: 'HMAC pads the key to 64 bytes and XORs it with 0x36, then hashes that together with the message.',
        next: 'A second hash seals the first one.',
        codeLine: line('inner = sha256('),
        variables: { inner: short(parts.inner) },
        view: byteGrid(parts.inner, 'inner'),
      },
      {
        title: 'Server computes the outer hash, which is the tag',
        why: `It hashes the key XOR 0x5c, then the inner hash. The tag is ${short(sentTag)}. Because the last thing hashed is short and fixed, nothing can be added after it.`,
        codeLine: line('return sha256((key ^ opad)'),
        variables: { tag: short(sentTag) },
        view: pair('Message', byteGrid(message, 'message'), 'Tag', byteGrid(sentTag, 'tag', () => 'found')),
      },
    );
  }

  // Key and message always fit one block here, so the digest is the state after 64 bytes.
  const glue = padding(key.length + message.length);
  const forged = concat(message, glue, extension);
  const forgedTag = resume(sentTag, 64, extension);
  const accepted = hex(sign(forged)) === hex(forgedTag);

  steps.push(
    {
      title: `Attacker copies the message and adds ${glue.length} bytes of padding`,
      why: naive
        ? `The attacker doesn't know the key, only its length (${key.length} bytes), which is easy to guess. That is enough to work out the padding SHA-256 added after key + message.`
        : `The attacker tries the same trick as on the naive scheme, still without the key. HMAC keeps its key out of reach, so this is only the padding the attacker hopes will work.`,
      next: `Then the attacker appends "${extensionText.value}".`,
      codeLine: line('glue = padding('),
      variables: { padding: glue.length },
      view: byteGrid(forged, 'forged', (i) => (i < message.length ? 'default' : i < message.length + glue.length ? 'compare' : 'found')),
    },
    {
      title: `Attacker resumes SHA-256 from the tag: ${short(forgedTag)}`,
      why: naive
        ? "A SHA-256 digest is the hash's whole internal state. Starting from the tag, the attacker can keep hashing the extension as if they had run the first block themselves."
        : 'Any SHA-256 digest can be resumed, so this step still runs. But this tag is the outer hash, and continuing it says nothing about the hash the server will compute over the new message.',
      codeLine: line('forgedTag = sha256Resume'),
      variables: { forgedTag: short(forgedTag) },
      view: pair('Forged message', byteGrid(forged, 'forged'), 'Forged tag', byteGrid(forgedTag, 'tag', () => 'compare')),
    },
    {
      title: accepted ? 'Server accepts the forged message' : 'Server rejects the forged message',
      why: accepted
        ? `Hashing key + forged message gives exactly ${short(forgedTag)}. The server now trusts a message that ends in "${extensionText.value}", and nobody ever had the key. That is the length-extension attack.`
        : `HMAC gives ${short(sign(forged))}, but the forged tag is ${short(forgedTag)}. The tag is the outer hash, so resuming from it extends the wrong hash. The attacker would need the key.`,
      codeLine: line('accepted = tag(key, forged)'),
      variables: { result: accepted ? 'accepted' : 'rejected' },
      view: pair('Forged message', byteGrid(forged, 'forged'), 'Server\'s own tag', byteGrid(sign(forged), 'tag', () => (accepted ? 'found' : 'discarded'))),
    },
  );
  return steps;
}
