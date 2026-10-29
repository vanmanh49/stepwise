import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, Step } from '../../types/visualization';
import { decode, SCHEMAS, type Slot } from '../constrain';
import { VOCAB } from '../corpus';
import { distributionView, EMPTY, fmt, ON_OFF, tokenRow } from '../steps';

export const structuredOutputCode = `tokens = ['the']   // the schema's first word starts the text
for (const slot of schema.slots.slice(1)) {
  probs = model(tokens)
  if (constrained) {
    for (const w of vocab) if (!slot.allows(w)) probs[w] = 0   // logit → −∞
    probs = probs / sum(probs)   // renormalise what is left
  }
  next = argmax(probs)
  tokens.push(next)
  if (next === END) break
}
json = fill(schema, tokens)   // invalid if a word breaks a slot`;

export const SCHEMA_IDS = SCHEMAS.map((s) => s.id);

const line = (snippet: string) => lineOf(structuredOutputCode, snippet);
const allowedText = (slot: Slot) => ('word' in slot ? slot.word : slot.allowed.join(' / '));
const jsonText = (json: Record<string, string>) => `{${Object.entries(json).map(([k, v]) => `"${k}": "${v}"`).join(', ')}}`;

export function structuredOutputSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't decode to this schema", why, EMPTY);
  const schemaId = readChoice(values, 'schema', 'Schema', SCHEMA_IDS);
  if (!schemaId.ok) return fail(schemaId.why);
  const mode = readChoice(values, 'constrained', 'Constrained', ON_OFF);
  if (!mode.ok) return fail(mode.why);

  const schema = SCHEMAS.find((s) => s.id === schemaId.value)!;
  const constrained = mode.value === 'on';
  const out = decode(schema, constrained);
  const steps: Step[] = [
    {
      title: `The schema: "${schema.pattern}"`,
      why: constrained
        ? 'Each slot is a fixed word or a field with a set of allowed words. The decoder will only let the model pick allowed words, so the output always fits.'
        : 'Each slot is a fixed word or a field with a set of allowed words. This time the model decodes freely, and the result is only checked afterwards.',
      codeLine: line("tokens = ['the']"),
      view: {
        kind: 'grid',
        colLabels: ['allowed'],
        rows: schema.slots.map((slot, i) => ({ label: 'name' in slot ? slot.name : `word ${i + 1}`, cells: [{ id: `slot-${i}`, value: allowedText(slot), role: 'name' in slot ? 'active' : 'default' }] })),
      },
    },
  ];
  const invalid = new Set<number>();
  const json: Record<string, string> = {};
  const jsonGrid = (): GridView => ({
    kind: 'grid',
    colLabels: ['value'],
    rows: Object.entries(json).map(([key, value]) => ({
      label: key,
      cells: [{ id: `json-${key}`, value, role: schema.slots.some((s, i) => 'name' in s && s.name === key && invalid.has(i)) ? 'discarded' : 'found' }],
    })),
  });
  for (const step of out.steps) {
    const slot = schema.slots[step.slot]!;
    const word = VOCAB[step.chosen]!;
    if (!step.valid) invalid.add(step.slot);
    if ('name' in slot) json[slot.name] = word;
    const sentence = out.words.slice(0, step.slot + 1);
    const cutText = constrained ? `cut ${step.cut.length} disallowed words, ` : '';
    steps.push({
      title: step.valid
        ? `Slot ${step.slot + 1} (${'name' in slot ? slot.name : `"${slot.word}"`}): ${cutText}pick ${word} (${fmt(step.probs[step.chosen]!)})`
        : `Slot ${step.slot + 1}: the model picks ${word}, but the schema needs ${allowedText(slot)}`,
      why: constrained
        ? 'Setting a word\'s logit to −∞ gives it probability 0. The words that are left are renormalised, so the most likely allowed word wins.'
        : step.valid
          ? 'Nothing stops the model; this word happens to fit the slot.'
          : 'Free decoding takes the model\'s favourite word, and the model has no idea what shape the app needs.',
      codeLine: constrained ? line('probs[w] = 0') : line('next = argmax(probs)'),
      variables: { text: sentence.join(' ') },
      view: {
        kind: 'panels',
        panels: [
          { label: 'Next word', view: distributionView(step.probs, { title: `P(next word | ${sentence.slice(0, -1).join(' ')})`, chosen: step.chosen, cut: new Set(step.cut) }) },
          { label: 'JSON so far', view: jsonGrid() },
        ],
      },
    });
  }
  const bad = out.steps.find((s) => !s.valid);
  steps.push({
    title: out.valid
      ? `The output ${jsonText(out.json)} matches the schema`
      : bad
        ? `The output does not match the schema: "${VOCAB[bad.chosen]}" where it needs ${allowedText(schema.slots[bad.slot]!)}`
        : 'The output does not match the schema: the sentence ended before every slot was filled',
    why: out.valid
      ? constrained
        ? 'Constrained decoding cannot produce anything else: every step could only pick an allowed word.'
        : 'Free decoding fitted this time, but nothing guaranteed it. Change the schema and it breaks.'
      : 'An app parsing this output would fail. Constrained decoding (or a retry) is how real apps get output they can always parse.',
    next: 'The model so far only knows what it learned in training. Vector search finds documents to give it, which is the first half of RAG.',
    codeLine: line('json = fill(schema, tokens)'),
    variables: { valid: out.valid ? 'yes' : 'no' },
    view: {
      kind: 'panels',
      panels: [
        { label: 'Output', view: tokenRow(out.words, (i) => (invalid.has(i) ? 'discarded' : 'default')) },
        { label: 'JSON', view: jsonGrid() },
      ],
    },
  });
  return steps;
}
