import type { Labels, Requirement, Selector } from './model';

function holds({ key, op, values }: Requirement, labels: Labels): boolean {
  const value = labels[key];
  switch (op) {
    case '=':
      return value === values[0];
    case '!=':
      return value !== values[0];
    case 'in':
      return value !== undefined && values.includes(value);
    case 'notin':
      return value === undefined || !values.includes(value);
    case 'exists':
      return value !== undefined;
  }
}

const format = ({ key, op, values }: Requirement) =>
  op === 'exists' ? key : op === 'in' || op === 'notin' ? `${key} ${op} (${values.join(',')})` : `${key}${op}${values[0] ?? ''}`;

/** True when every requirement holds for the labels. */
export function matches(selector: Selector, labels: Labels): boolean {
  return selector.every((r) => holds(r, labels));
}

/** Whether the labels match, and the requirement that decided: the first that fails, else the last. */
export function explainMatch(selector: Selector, labels: Labels): { ok: boolean; requirement: string } {
  const failed = selector.find((r) => !holds(r, labels));
  const decided = failed ?? selector.at(-1);
  return { ok: !failed, requirement: decided ? format(decided) : '' };
}

export function formatSelector(selector: Selector): string {
  return selector.map(format).join(', ');
}
