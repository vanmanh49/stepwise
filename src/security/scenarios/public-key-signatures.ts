import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, Role, Step } from '../../types/visualization';
import { isPrime, modInverseTrace, modPow } from '../crypto/numbers';
import { decrypt, digestNumber, encrypt, keyPair, sign, verify } from '../crypto/rsa';
import { EMPTY, readBytes } from '../steps';

export const publicKeySignaturesCode = `n = p * q                 // public; p and q stay secret
phi = (p - 1) * (q - 1)   // easy with p and q, hard with only n
// e is public and shares no factor with phi
d = inverse(e, phi)       // extended Euclid: e * d mod phi == 1

function encrypt(m) { return m ^ e mod n }
function decrypt(c) { return c ^ d mod n }

function sign(message) { return hash(message) ^ d mod n }
function verify(message, s) { return s ^ e mod n == hash(message) }`;

export const OPERATIONS = ['Encrypt', 'Sign'];
export const TAMPER = ['No', 'Yes'];
export const PRIME_RANGE = { min: 11, max: 997 };
export const EXPONENT_RANGE = { min: 3, max: 65537 };
export const MAX_MESSAGE = 40;

const line = (snippet: string) => lineOf(publicKeySignaturesCode, snippet);

const TITLE = "Can't use this key";

export function publicKeySignaturesSteps(values: Record<string, string>): Step[] {
  const operation = readChoice(values, 'operation', 'Operation', OPERATIONS);
  if (!operation.ok) return refusal(TITLE, operation.why, EMPTY);
  const tamper = readChoice(values, 'tamper', 'Tamper', TAMPER);
  if (!tamper.ok) return refusal(TITLE, tamper.why, EMPTY);
  const pRead = readInt(values, 'p', 'p', PRIME_RANGE);
  if (!pRead.ok) return refusal(TITLE, pRead.why, EMPTY);
  const qRead = readInt(values, 'q', 'q', PRIME_RANGE);
  if (!qRead.ok) return refusal(TITLE, qRead.why, EMPTY);
  const eRead = readInt(values, 'e', 'e', EXPONENT_RANGE);
  if (!eRead.ok) return refusal(TITLE, eRead.why, EMPTY);
  const p = pRead.value;
  const q = qRead.value;
  const e = eRead.value;
  if (!isPrime(p) || !isPrime(q)) return refusal(TITLE, `p and q must both be prime, and ${isPrime(p) ? q : p} is not.`, EMPTY);
  if (p === q) return refusal(TITLE, 'p and q must be different primes, or anyone could take the square root of n.', EMPTY);
  const key = keyPair(p, q, e);
  if (!key) return refusal(TITLE, `e = ${e} shares a factor with φ(n) = ${(p - 1) * (q - 1)}, so it has no inverse. Try another e, such as 17.`, EMPTY);
  const { n, phi, d } = key;
  if (d === 1 || d === e) return refusal(TITLE, `With e = ${e}, the private exponent is d = ${d}, ${d === 1 ? 'so encrypting changes nothing' : 'so the private key is the same as the public one'}. Try another e.`, EMPTY);
  const secret = readInt(values, 'number', 'Number', { min: 0, max: n - 1 });
  if (!secret.ok) return refusal(TITLE, secret.why, EMPTY);
  const signing = operation.value === 'Sign';
  const message = readBytes(values, 'message', 'Message', { min: signing ? 1 : 0, max: MAX_MESSAGE });
  if (!message.ok) return refusal(TITLE, message.why, EMPTY);

  const known = new Map<string, number>([['p', p], ['q', q]]);
  const keyGrid = (active?: string): GridView => ({
    kind: 'grid',
    rows: ['p', 'q', 'n', 'φ(n)', 'e', 'd'].map((label) => ({
      label,
      cells: [{ id: `key-${label}`, value: known.get(label) ?? '–', role: (label === active ? 'active' : 'default') as Role }],
    })),
  });

  known.set('n', n);
  const steps: Step[] = [
    {
      title: `n = ${n} (${p} × ${q})`,
      why: 'Multiplying two primes is easy. Getting them back from n is the hard part, and it is what protects the key. These primes are tiny so you can follow along.',
      next: 'Next come the numbers that make up the key pair.',
      codeLine: line('n = p * q'),
      variables: { n },
      view: keyGrid('n'),
    },
  ];
  known.set('φ(n)', phi);
  steps.push({
    title: `φ(n) = ${phi} (${p - 1} × ${q - 1})`,
    why: 'φ(n) counts the numbers below n that share no factor with it. Computing it needs p and q, so someone with only n can\'t.',
    codeLine: line('phi = (p - 1)'),
    variables: { phi },
    view: keyGrid('φ(n)'),
  });
  known.set('e', e);
  steps.push({
    title: `e = ${e} is the public exponent`,
    why: `e can be almost any number that shares no factor with ${phi}. Together, n and e are the public key.`,
    codeLine: line('e is public'),
    variables: { e },
    view: keyGrid('e'),
  });

  const { rows } = modInverseTrace(e, phi);
  let dividend = phi;
  let divisor = e % phi;
  for (const { q: quotient, r } of rows) {
    steps.push({
      title: `Euclid: ${dividend} = ${quotient} × ${divisor} + ${r}`,
      why: 'Extended Euclid divides repeatedly, keeping track of how each remainder was built, until it reaches 1. That record gives the inverse of e.',
      codeLine: line('d = inverse(e, phi)'),
      variables: { remainder: r },
      view: keyGrid(),
    });
    [dividend, divisor] = [divisor, r];
  }
  known.set('d', d);
  steps.push({
    title: `d = ${d}, because ${e} × ${d} mod ${phi} = 1`,
    why: 'd undoes e. It is the private key, and it can only be computed from φ(n), which needs p and q.',
    next: signing ? 'Signing uses d, and verifying uses e.' : 'Anyone can encrypt with e; only the holder of d can decrypt.',
    codeLine: line('d = inverse(e, phi)'),
    variables: { d },
    view: keyGrid('d'),
  });

  if (!signing) {
    const m = secret.value;
    const c = encrypt(m, key);
    steps.push(
      {
        title: `Encrypt: ${m}^${e} mod ${n} = ${c}`,
        why:
          c === m
            ? `${m} encrypts to itself. Textbook RSA leaves a few numbers unchanged, such as 0 and 1, which is another reason real RSA adds padding.`
            : 'Anyone with the public key can do this. Knowing e and n does not help anyone undo it.',
        codeLine: line('function encrypt'),
        variables: { message: m, ciphertext: c },
        view: keyGrid('e'),
      },
      {
        title: `Decrypt: ${c}^${d} mod ${n} goes back to ${decrypt(c, key)}`,
        why: 'Raising to e and then to d gets back to the original number, because e and d are inverses.',
        codeLine: line('function decrypt'),
        variables: { message: decrypt(c, key) },
        view: keyGrid('d'),
      },
      {
        title: `Encrypting ${m} again gives ${encrypt(m, key)} again`,
        why: 'This is textbook RSA, and it is deterministic: an attacker can encrypt guesses and compare. Real RSA adds random padding (OAEP), so the same message never encrypts the same way twice.',
        codeLine: line('function encrypt'),
        variables: { first: c, second: encrypt(m, key) },
        view: keyGrid('e'),
      },
    );
    return steps;
  }

  const original = message.value;
  const signature = sign(original, key);
  const received = tamper.value === 'Yes' ? `${original}!` : original;
  steps.push({
    title: `Sign: hash("${original}") = ${digestNumber(original, n)}, and ${digestNumber(original, n)}^${d} mod ${n} = ${signature}`,
    why: 'The signer uses the private key on the hash of the message. Here the real SHA-256 digest is reduced modulo n to fit the toy key.',
    codeLine: line('function sign'),
    variables: { hash: digestNumber(original, n), signature },
    view: keyGrid('d'),
  });
  if (received !== original) {
    steps.push({
      title: `Attacker changes the message to "${received}"`,
      why: 'The message travels in the open, so anyone on the way can change it. The attacker can\'t make a new signature without d.',
      codeLine: line('function verify'),
      variables: { signature },
      view: keyGrid(),
    });
  }
  const expected = digestNumber(received, n);
  const recovered = modPow(signature, e, n);
  const valid = verify(received, signature, key);
  const collision = valid && received !== original;
  const verdict = `${recovered} against hash ${expected}`;
  steps.push({
    title: collision ? `Signature still passes for "${received}"` : valid ? `Signature valid for "${received}"` : `Signature fails for "${received}"`,
    why: collision
      ? `Both messages reduce to the same number modulo ${n} (${verdict}). That is a collision caused by this toy key size, not a weakness in signatures: at real sizes the whole digest is signed, and such a match never happens.`
      : valid
        ? `Anyone can check this with the public key: ${verdict} match. Only the holder of d could have made it, and the message hasn't changed.`
        : `Using e on the signature gives ${verdict}, and they differ. The message isn't what was signed, so it is rejected.`,
    codeLine: line('function verify'),
    variables: { result: valid ? 'valid' : 'invalid', recovered, hash: expected },
    view: keyGrid('e'),
  });
  return steps;
}
