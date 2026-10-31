import { seeded } from '../../utils/random';
import { utf8 } from '../crypto/bytes';

/** Simulated seconds since 1970; the clock starts here on every run. */
export const START_TIME = 1_700_000_000;

export const WORDLIST = ['123456', 'password', 'qwerty', 'letmein', 'dragon', 'sunshine', 'iloveyou', 'admin', 'welcome', 'monkey', 'football', 'secret'] as const;

export const USERS = [
  { name: 'alice', password: 'sunshine', role: 'customer' },
  { name: 'bob', password: 'sunshine', role: 'customer' },
  { name: 'carol', password: 'correct-horse-battery', role: 'customer' },
  { name: 'root', password: 'dragon', role: 'admin' },
] as const;

/** The attacker's own ordinary account, for lessons that plant a comment. */
export const MALLORY = { name: 'mallory', password: 'stored-xss', role: 'customer' };

export const ORDERS = [
  { id: 101, owner: 'alice', item: 'Lamp', total: 40 },
  { id: 102, owner: 'bob', item: 'Desk', total: 250 },
  { id: 103, owner: 'carol', item: 'Chair', total: 120 },
] as const;

/** Name and password pairs leaked from another site. Only alice reused one here. */
export const LEAKED_PAIRS = [
  { name: 'dave', password: 'hunter2' },
  { name: 'erin', password: 'trustno1' },
  { name: 'alice', password: 'sunshine' },
  { name: 'frank', password: 'baseball' },
  { name: 'grace', password: 'shadow' },
  { name: 'heidi', password: 'master' },
] as const;

export const TOTP_SECRET = utf8('stepwise-totp-secret');

function seededBytes(seed: number, length: number): Uint8Array {
  const random = seeded(seed);
  return Uint8Array.from({ length }, () => Math.floor(random() * 256));
}

export const TOKEN_SECRET = seededBytes(4242, 32);
