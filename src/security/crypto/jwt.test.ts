import { describe, expect, it } from 'vitest';
import { decodeBase64url, encodeBase64url } from './base64url';
import { utf8 } from './bytes';
import { hs256Signature, signHs256, signToyRs, splitToken, unsignedToken, verifyToyRs } from './jwt';
import { keyPair } from './rsa';

const KEY = keyPair(691, 809, 17)!;
const part = (text: string) => encodeBase64url(utf8(text));

describe('hs256Signature', () => {
  it('matches RFC 7515 appendix A.1', () => {
    const key = decodeBase64url('AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow')!;
    const signed = 'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ';
    expect(hs256Signature(signed, key)).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  });
});

describe('splitToken', () => {
  it('reads back a signed token', () => {
    const parts = splitToken(signHs256({ sub: 'alice' }, utf8('key')));
    expect(parts?.payload).toEqual({ sub: 'alice' });
    expect(parts?.header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('keeps the signed part exactly as it arrived', () => {
    const token = signHs256({ sub: 'alice' }, utf8('key'));
    expect(splitToken(token)?.signedPart).toBe(token.split('.').slice(0, 2).join('.'));
  });

  it.each([
    ['two parts', 'a.b'],
    ['bad base64url', `!!.${part('{}')}.x`],
    ['a part that is not JSON', `${part('nope')}.${part('{}')}.x`],
    ['a part that is not an object', `${part('[1]')}.${part('{}')}.x`],
    ['a part that is null', `${part('null')}.${part('{}')}.x`],
  ])('refuses %s', (_name, token) => {
    expect(splitToken(token)).toBeNull();
  });
});

describe('unsignedToken', () => {
  it('names alg none and has an empty signature', () => {
    const parts = splitToken(unsignedToken({ sub: 'alice' }));
    expect(parts?.header.alg).toBe('none');
    expect(parts?.signature).toBe('');
  });
});

describe('toy RSA signatures', () => {
  it('accepts its own signature', () => {
    expect(verifyToyRs(signToyRs({ sub: 'alice' }, KEY), KEY)).toBe(true);
  });

  it('refuses a changed payload', () => {
    const [header, , signature] = signToyRs({ sub: 'alice' }, KEY).split('.');
    expect(verifyToyRs(`${header}.${part('{"sub":"alicf"}')}.${signature}`, KEY)).toBe(false);
  });

  it('refuses a signature that is not a number', () => {
    const [header, payload] = signToyRs({ sub: 'alice' }, KEY).split('.');
    expect(verifyToyRs(`${header}.${payload}.${part('abc')}`, KEY)).toBe(false);
  });
});
