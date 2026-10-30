import { describe, expect, it } from 'vitest';
import { allowsScript } from './csp';
import type { FoundScript } from './html';

const PAGE = 'https://shop.example';
const inline: FoundScript = { source: 'alert(1)', kind: 'inline' };
const handler: FoundScript = { source: 'alert(1)', kind: 'handler' };
const signed: FoundScript = { source: 'alert(1)', kind: 'inline', nonce: 'abc' };
const external = (nonce?: string): FoundScript => ({ source: 'x.js', kind: 'external', ...(nonce && { nonce }) });
const EVIL_JS = 'https://evil.example/x.js';
const OWN_JS = `${PAGE}/x.js`;

describe('allowsScript', () => {
  it.each<[string, string | undefined, FoundScript, string | undefined, boolean]>([
    ['no policy allows inline', undefined, inline, undefined, true],
    ['no policy allows outside scripts', undefined, external(), EVIL_JS, true],
    ['unsafe-inline allows inline', "script-src 'self' 'unsafe-inline'", inline, undefined, true],
    ['unsafe-inline allows handlers', "script-src 'self' 'unsafe-inline'", handler, undefined, true],
    ['unsafe-inline blocks an evil host', "script-src 'self' 'unsafe-inline'", external(), EVIL_JS, false],
    ['self allows the same origin', "script-src 'self'", external(), OWN_JS, true],
    ['self blocks inline', "script-src 'self'", inline, undefined, false],
    ['a nonce allows the matching script', "script-src 'nonce-abc'", signed, undefined, true],
    ['a nonce blocks a script without one', "script-src 'nonce-abc'", inline, undefined, false],
    ['a nonce blocks the wrong one', "script-src 'nonce-xyz'", signed, undefined, false],
    ['a nonce blocks handlers', "script-src 'nonce-abc'", handler, undefined, false],
    ['a nonce blocks outside scripts', "script-src 'nonce-abc'", external(), EVIL_JS, false],
    ['a nonce allows an outside script that carries it', "script-src 'nonce-abc'", external('abc'), EVIL_JS, true],
    ['a nonce switches unsafe-inline off', "script-src 'unsafe-inline' 'nonce-abc'", inline, undefined, false],
    ['default-src applies with no script-src', "default-src 'self'", external(), EVIL_JS, false],
    ['script-src wins over default-src', "default-src 'none'; script-src 'self'", external(), OWN_JS, true],
    ['a source allows that host', 'script-src https://evil.example', external(), EVIL_JS, true],
    ['a bare host allows that host', 'script-src evil.example', external(), EVIL_JS, true],
    ['another directive says nothing about scripts', "img-src 'self'", inline, undefined, true],
  ])('%s', (_name, policy, script, url, allowed) => {
    expect(allowsScript(policy, script, PAGE, url).allowed).toBe(allowed);
  });

  it('names the directive that blocked a script', () => {
    expect(allowsScript("default-src 'self'", inline, PAGE).rule).toBe("default-src 'self'");
    expect(allowsScript("img-src *; script-src 'nonce-abc'", inline, PAGE).rule).toBe("script-src 'nonce-abc'");
  });

  it('names no rule when a script is allowed', () => {
    expect(allowsScript(undefined, inline, PAGE).rule).toBeUndefined();
  });
});
