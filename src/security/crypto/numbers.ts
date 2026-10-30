// Teaching code: never use this for real data. Use your platform's crypto library.

/** Diffie-Hellman groups small enough to follow by hand. */
export const GROUPS: readonly { p: number; g: number }[] = [
  { p: 23, g: 5 },
  { p: 227, g: 2 },
  { p: 65537, g: 3 },
];

/** Square and multiply. Moduli stay below 2^20, so every product stays below 2^53. */
export function modPow(base: number, exp: number, mod: number): number {
  let result = 1 % mod;
  let square = base % mod;
  for (let e = exp; e > 0; e = Math.floor(e / 2)) {
    if (e % 2 === 1) result = (result * square) % mod;
    square = (square * square) % mod;
  }
  return result;
}

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Extended Euclid: one row per division, and a⁻¹ mod m when it exists. */
export function modInverseTrace(a: number, m: number): { rows: { q: number; r: number; t: number }[]; inverse: number | null } {
  const rows: { q: number; r: number; t: number }[] = [];
  let [oldR, r] = [m, a % m];
  let [oldT, t] = [0, 1];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldT, t] = [t, oldT - q * t];
    if (r !== 0) rows.push({ q, r, t });
  }
  return { rows, inverse: oldR === 1 ? ((oldT % m) + m) % m : null };
}

export const modInverse = (a: number, m: number): number | null => modInverseTrace(a, m).inverse;

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}
