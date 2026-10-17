import { describe, expect, it } from 'vitest';
import { inputModeFor } from './formField';

describe('inputModeFor', () => {
  // Phone numeric keypads may have no comma or space, so lists need the text keyboard.
  it('uses the text keyboard for comma-separated lists', () => {
    expect(inputModeFor('numbers')).toBe('text');
  });

  it('uses the numeric keypad for a single number', () => {
    expect(inputModeFor('number')).toBe('numeric');
  });

  it('uses the text keyboard for text', () => {
    expect(inputModeFor('text')).toBe('text');
  });
});
