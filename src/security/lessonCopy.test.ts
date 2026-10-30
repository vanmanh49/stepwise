import { describe, expect, it } from 'vitest';
import { allLessons } from '../lessons/all.testutil';

const text = (id: string) => JSON.stringify(allLessons.find((lesson) => lesson.id === id));

/** Claims a final review found false, kept out because no other test reads lesson text. */
describe('identity lesson copy', () => {
  it('does not say one word cracks equal hashes: the attacker must still search', () => {
    expect(text('password-storage')).not.toContain('One word: their hashes are equal');
    expect(text('password-storage')).toContain('How many searches');
  });

  it('says PBKDF2 makes each guess dearer, not more of them', () => {
    expect(text('password-storage')).not.toContain('only costs more guesses');
    expect(text('password-storage')).toContain('each guess only costs more');
  });

  it('does not claim every browser defaults SameSite to Lax', () => {
    expect(text('sessions-cookies')).not.toContain('browsers treat it as Lax');
    expect(text('sessions-cookies')).toContain('not every browser');
  });

  it('says PKCE stops login CSRF too', () => {
    expect(text('oauth-pkce')).toContain('PKCE also stops this');
  });

  it('says a per-address limit slows guessing rather than ending it', () => {
    expect(text('credential-attacks')).not.toContain('ends it quickly');
    expect(text('credential-attacks')).not.toContain('and limits stop it');
    expect(text('credential-attacks')).not.toContain('Limits end online guessing');
  });

  it('does not call an access token a token with a signature', () => {
    expect(text('openid-connect')).not.toContain('four tokens that pass the signature check');
    expect(text('openid-connect')).toContain('three real ID tokens and one access token');
  });

  it('does not claim most MFA is bypassed through recovery', () => {
    expect(text('multi-factor-auth')).not.toContain('where most MFA gets bypassed');
  });
});
