import { describe, expect, it } from 'vitest';
import { decodeBase64url, encodeBase64url } from './base64url';
import { hex, utf8 } from './bytes';
import { pbkdf2 } from './pbkdf2';

describe('pbkdf2', () => {
  it('matches the published vector for one round', () => {
    expect(hex(pbkdf2(utf8('password'), utf8('salt'), 1, 32))).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  });
});

describe('base64url', () => {
  it('decodes what it encodes', () => {
    const bytes = Uint8Array.of(0, 251, 255, 16, 1);
    expect(decodeBase64url(encodeBase64url(bytes))).toEqual(bytes);
  });

  it('decodes nothing to nothing', () => {
    expect(decodeBase64url('')).toEqual(new Uint8Array(0));
  });

  it.each(['a!b', 'a', 'ab='])('refuses %s', (text) => {
    expect(decodeBase64url(text)).toBeNull();
  });
});
