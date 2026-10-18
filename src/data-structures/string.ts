import { arrayView, swapCells } from '../algorithms/sorting/cells';
import type { TextDef } from '../types/lesson';
import type { Cell, Role, Step } from '../types/visualization';
import { MAX_TEXT_LENGTH, parseText } from '../utils/parseInput';

const code = `class Text {
  constructor(private chars: string) {}

  charAt(index: number): string {
    return this.chars[index]; // direct access, like an array
  }

  concat(other: string): string {
    let result = '';
    for (const ch of this.chars) result += ch; // copy every character
    for (const ch of other) result += ch;
    return result; // a brand-new string
  }

  reverse(): string {
    const chars = [...this.chars];
    let left = 0, right = chars.length - 1;
    while (left < right) {
      [chars[left], chars[right]] = [chars[right], chars[left]];
      left++; right--;
    }
    return chars.join('');
  }

  isPalindrome(): boolean {
    let left = 0, right = this.chars.length - 1;
    while (left < right) {
      if (this.chars[left] !== this.chars[right]) return false;
      left++; right--;
    }
    return true;
  }
}`;

// A space would be invisible in a cell, so it is drawn with a visible stand-in.
const show = (ch: string) => (ch === ' ' ? '␣' : ch);
const toCells = (text: string, prefix = 'c'): Cell[] =>
  [...text].map((ch, i) => ({ id: `${prefix}${i}`, value: show(ch), role: 'default' }));
const view = (text: string) => arrayView(toCells(text));
const all = (count: number, role: Role) => Object.fromEntries(Array.from({ length: count }, (_, i) => [i, role]));

function refuse(text: string, title: string, why: string, codeLine: number): { steps: Step[]; text: string } {
  return { steps: [{ title, why, codeLine, view: view(text) }], text };
}

export const stringStructure: TextDef = {
  initial: 'LEVEL',
  view,
  code,
  ops: [
    {
      id: 'charAt',
      label: 'Character at',
      arg: { label: 'Index', sample: '1', numeric: true },
      run(text, arg) {
        const index = /^\d+$/.test(arg.trim()) ? Number(arg) : NaN;
        if (Number.isNaN(index) || index >= text.length) {
          return refuse(
            text,
            `Index ${arg.trim() === '' ? '(empty)' : arg.trim()} is out of range`,
            `Valid indexes for "${text}" are 0 to ${text.length - 1}. Like an array, a string is numbered from 0.`,
            5,
          );
        }
        const cells = toCells(text);
        return {
          text,
          steps: [
            {
              title: `Go straight to index ${index}`,
              why: 'A string is stored as a row of characters, so any position can be reached directly, exactly like an array.',
              next: 'Read the character stored there.',
              codeLine: 5,
              variables: { index },
              view: arrayView(cells, { [index]: 'active' }, [], { index }),
            },
            {
              title: `Read "${show(text[index]!)}"`,
              why: 'Reading one character is O(1), however long the string is.',
              codeLine: 5,
              variables: { index, result: show(text[index]!) },
              view: arrayView(cells, { [index]: 'found' }, [], { index }),
            },
          ],
        };
      },
    },
    {
      id: 'concat',
      label: 'Concatenate',
      arg: { label: 'Text to add', sample: 'S' },
      run(text, arg) {
        const parsed = parseText(arg);
        if (!parsed.ok) return refuse(text, arg.length === 0 ? 'Nothing to add' : 'Cannot add that text', parsed.error, 9);
        if (text.length + arg.length > MAX_TEXT_LENGTH) {
          return refuse(
            text,
            'The result would be too long',
            `This visualization shows at most ${MAX_TEXT_LENGTH} characters. Add something shorter, or reset the text.`,
            9,
          );
        }
        const cells = toCells(text);
        const added = toCells(arg, 'a');
        const result = text + arg;
        return {
          text: result,
          steps: [
            {
              title: `Concatenate "${text}" and "${arg}"`,
              why: 'In most languages a string cannot be changed once created. Joining two strings therefore builds a third one.',
              next: 'Start with an empty result and copy the first string into it.',
              codeLine: 9,
              variables: { result: '""' },
              view: arrayView(cells),
            },
            {
              title: `Copy all ${text.length} character${text.length === 1 ? '' : 's'} of "${text}"`,
              why: 'Every existing character has to be copied, even though none of them changed. That is the hidden cost of concatenation.',
              next: `Then copy "${arg}" after them.`,
              codeLine: 10,
              variables: { result: `"${text}"`, copied: text.length },
              view: arrayView(cells, all(text.length, 'swap')),
            },
            {
              title: `Append "${arg}"`,
              why: `In total ${result.length} characters were copied to add ${arg.length}. Doing this inside a loop costs O(n²), which is why languages offer string builders.`,
              codeLine: 11,
              variables: { result: `"${result}"`, copied: result.length },
              view: arrayView(
                [...cells, ...added],
                Object.fromEntries(added.map((_, i) => [text.length + i, 'found' as Role])),
              ),
            },
            {
              title: `The new string is "${result}"`,
              why: 'The original string still exists unchanged; the variable now refers to the new one.',
              codeLine: 12,
              variables: { result: `"${result}"`, length: result.length },
              view: arrayView([...cells, ...added]),
            },
          ],
        };
      },
    },
    {
      id: 'reverse',
      label: 'Reverse',
      run(text) {
        const cells = toCells(text);
        const steps: Step[] = [
          {
            title: `Reverse "${text}"`,
            why: 'Copy the characters into an array, then swap the two ends and move inward until the pointers meet.',
            codeLine: 16,
            view: arrayView(cells, {}, [], text.length > 0 ? { left: 0, right: text.length - 1 } : undefined),
          },
        ];
        let left = 0;
        let right = text.length - 1;
        while (left < right) {
          const a = cells[left]!.value;
          const b = cells[right]!.value;
          swapCells(cells, left, right);
          steps.push({
            title: `Swap "${a}" and "${b}"`,
            why: `The character at index ${left} belongs at index ${right} in the reversed string, and the other way round.`,
            next: 'Move both pointers one step toward the middle.',
            codeLine: 19,
            variables: { left, right },
            view: arrayView(cells, { [left]: 'swap', [right]: 'swap' }, [], { left, right }),
          });
          left++;
          right--;
        }
        const result = [...text].toReversed().join('');
        steps.push({
          title: `The reversed string is "${result}"`,
          why:
            text.length === 1
              ? 'A single character is its own reverse. Both pointers start on the same position, so nothing is swapped.'
              : text.length % 2 === 1
              ? 'The pointers met on the middle character, which stays where it is. Only half as many swaps as characters were needed.'
              : 'The pointers crossed, so every character has been moved. Only half as many swaps as characters were needed.',
          codeLine: 22,
          variables: { result: `"${result}"` },
          view: arrayView(cells, all(cells.length, 'found')),
        });
        return { steps, text: result };
      },
    },
    {
      id: 'palindrome',
      label: 'Is palindrome?',
      run(text) {
        const cells = toCells(text);
        const matched: Record<number, Role> = {};
        const steps: Step[] = [
          {
            title: `Does "${text}" read the same backwards?`,
            why: 'A palindrome mirrors around its middle, so compare the first character with the last, the second with the second-to-last, and so on.',
            codeLine: 26,
            view: arrayView(cells, {}, [], text.length > 0 ? { left: 0, right: text.length - 1 } : undefined),
          },
        ];
        let left = 0;
        let right = text.length - 1;
        while (left < right) {
          const a = text[left]!;
          const b = text[right]!;
          if (a !== b) {
            steps.push({
              title: `"${show(a)}" and "${show(b)}" differ: not a palindrome`,
              why: 'One mismatching pair is enough. There is no need to look at the characters in between.',
              codeLine: 28,
              variables: { left, right, result: 'false' },
              view: arrayView(cells, { ...matched, [left]: 'swap', [right]: 'swap' }, [], { left, right }),
            });
            return { steps, text };
          }
          matched[left] = 'found';
          matched[right] = 'found';
          steps.push({
            title: `"${show(a)}" matches "${show(b)}"`,
            why: `Index ${left} and index ${right} hold the same character, so this pair mirrors correctly.`,
            next: 'Move both pointers one step toward the middle.',
            codeLine: 28,
            variables: { left, right },
            view: arrayView(cells, { ...matched }, [], { left, right }),
          });
          left++;
          right--;
        }
        steps.push({
          title: `"${text}" is a palindrome`,
          why: 'Every pair matched and the pointers met in the middle. A middle character on its own always matches itself.',
          codeLine: 31,
          variables: { result: 'true' },
          view: arrayView(cells, all(cells.length, 'found')),
        });
        return { steps, text };
      },
    },
  ],
};
