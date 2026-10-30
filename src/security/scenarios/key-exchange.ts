import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Role, Step } from '../../types/visualization';
import { GROUPS, modPow } from '../crypto/numbers';
import { EMPTY, partiesView } from '../steps';

export const keyExchangeCode = `// public: a prime p and a generator g
A = g ^ a mod p          // Alice's share; a stays secret
B = g ^ b mod p          // Bob's share; b stays secret
send(A); send(B)         // anyone can read these
aliceKey = B ^ a mod p
bobKey = A ^ b mod p     // both are g ^ (a * b) mod p

// an eavesdropper tries every exponent
for (x = 1; g ^ x mod p != A; x++) {}
shared = B ^ x mod p

// a man in the middle swaps both shares for M
M = g ^ m mod p
aliceKeyWithMallory = M ^ a mod p
bobKeyWithMallory = M ^ b mod p`;

export const PRIMES = GROUPS.map((group) => String(group.p));
export const ATTACKERS = ['None', 'Eavesdropper', 'Man in the middle'];

/** Mallory picks a secret of their own, so the swapped share never looks like the real one. */
const MALLORY_SECRETS = [9, 10, 11];
const SHOWN_TRIES = 3;
const COLUMNS = ['Public', 'Secret', 'Key'];
const UNKNOWN = '–';

const line = (snippet: string) => lineOf(keyExchangeCode, snippet);

interface Row {
  party: string;
  values: string[];
}

/** Cells are 44 px wide, so short values must not wrap. */
const tight = ({ party, values }: Row): Row => ({ party, values: values.map((value) => value.replaceAll(' = ', '=')) });

const TITLE = "Can't run this exchange";

export function keyExchangeSteps(values: Record<string, string>): Step[] {
  const prime = readChoice(values, 'prime', 'Prime', PRIMES);
  if (!prime.ok) return refusal(TITLE, prime.why, EMPTY);
  const { p, g } = GROUPS[PRIMES.indexOf(prime.value)]!;
  const range = { min: 2, max: p - 2 };
  const secretA = readInt(values, 'a', "Alice's secret a", range);
  if (!secretA.ok) return refusal(TITLE, secretA.why, EMPTY);
  const secretB = readInt(values, 'b', "Bob's secret b", range);
  if (!secretB.ok) return refusal(TITLE, secretB.why, EMPTY);
  const attacker = readChoice(values, 'attacker', 'Attacker', ATTACKERS);
  if (!attacker.ok) return refusal(TITLE, attacker.why, EMPTY);

  const a = secretA.value;
  const b = secretB.value;
  const A = modPow(g, a, p);
  const B = modPow(g, b, p);
  const shared = modPow(B, a, p);
  const mode = attacker.value;
  const hasAttacker = mode !== 'None';
  const attackerName = mode === 'Eavesdropper' ? 'Eve' : 'Mallory';

  const steps: Step[] = [];
  const log: string[] = [];
  const view = (known: Row[], messages: { from: string; to: string; label: string; role: Role }[] = []) =>
    partiesView({ attacker: hasAttacker, messages, known: known.map(tight), columns: COLUMNS, log: log.slice(-4), names: { client: 'Alice', attacker: attackerName, server: 'Bob' } });
  const add = (step: Omit<Step, 'view'>, known: Row[], messages?: Parameters<typeof view>[1]) => {
    log.push(step.title);
    steps.push({ ...step, view: view(known, messages) });
  };
  const eve = (publicText: string, secret = UNKNOWN, key = UNKNOWN): Row[] => (mode === 'Eavesdropper' ? [{ party: 'Eve', values: [publicText, secret, key] }] : []);

  const start = `p = ${p}, g = ${g}`;
  add(
    {
      title: `Everyone can see p = ${p} and g = ${g}`,
      why: 'Alice and Bob have never shared a secret, and the attacker can read everything they send. They agree on these two public numbers first.',
      next: 'Each side picks a secret and never sends it.',
      codeLine: line('// public: a prime p'),
      variables: { p, g },
    },
    [{ party: 'Alice', values: [start, `a = ${a}`, UNKNOWN] }, { party: 'Bob', values: [start, `b = ${b}`, UNKNOWN] }, ...eve(start)],
  );

  if (mode === 'Man in the middle') return [...steps, ...middleSteps()];

  add(
    {
      title: `Alice sends A = ${A} (${g}^${a} mod ${p})`,
      why: `Raising to a power mod p is quick, but going back from A to a is hard when p is large. So A can be public while a stays secret.`,
      codeLine: line('A = g ^ a mod p'),
      variables: { A },
    },
    [{ party: 'Alice', values: [`A = ${A}`, `a = ${a}`, UNKNOWN] }, { party: 'Bob', values: [`A = ${A}`, `b = ${b}`, UNKNOWN] }, ...eve(`A = ${A}`)],
    [{ from: 'client', to: hasAttacker ? 'attacker' : 'server', label: `A = ${A}`, role: 'active' }],
  );
  const both = `A = ${A}, B = ${B}`;
  add(
    {
      title: `Bob sends B = ${B} (${g}^${b} mod ${p})`,
      why: 'Bob does the same with a separate secret. Both shares have now crossed the open network.',
      codeLine: line('B = g ^ b mod p'),
      variables: { B },
    },
    [{ party: 'Alice', values: [both, `a = ${a}`, UNKNOWN] }, { party: 'Bob', values: [both, `b = ${b}`, UNKNOWN] }, ...eve(both)],
    [{ from: 'server', to: hasAttacker ? 'attacker' : 'client', label: `B = ${B}`, role: 'active' }],
  );
  const keyed: Row[] = [{ party: 'Alice', values: [both, `a = ${a}`, String(shared)] }, { party: 'Bob', values: [both, `b = ${b}`, String(shared)] }];
  add(
    {
      title: `Alice computes ${B}^${a} mod ${p} = ${shared}`,
      why: 'Alice raises Bob\'s share to the power of a.',
      codeLine: line('aliceKey = B ^ a'),
      variables: { alice: shared },
    },
    [keyed[0]!, { party: 'Bob', values: [both, `b = ${b}`, UNKNOWN] }, ...eve(both)],
  );
  add(
    {
      title: `Bob computes ${A}^${b} mod ${p} = ${shared}: both sides hold the same key`,
      why: `Both sides computed g^(a × b) mod p, just in a different order, and the number ${shared} never crossed the network.`,
      next: mode === 'Eavesdropper' ? `Eve saw A and B. Is that enough to get ${shared}?` : undefined,
      codeLine: line('bobKey = A ^ b'),
      variables: { alice: shared, bob: shared },
    },
    [...keyed, ...eve(both)],
  );
  if (mode === 'None') return steps;

  let found = 1;
  for (let value = g; value !== A; value = (value * g) % p) found++;
  for (let x = 1; x < found && x <= SHOWN_TRIES; x++) {
    add(
      {
        title: `Eve tries x = ${x}: ${g}^${x} mod ${p} = ${modPow(g, x, p)}, not ${A}`,
        why: 'With no shortcut, Eve tests one exponent after another until one gives A.',
        codeLine: line('for (x = 1;'),
        variables: { x },
      },
      [...keyed, ...eve(both, `x = ${x}?`)],
    );
  }
  add(
    {
      title: `Eve finds a = ${found} after ${found} tries, so the key is ${shared}`,
      why: `Searching ${found} numbers takes no time, because p = ${p} is tiny. This is why these numbers are toys. Real groups use 2048-bit primes or elliptic curves, where the same search would outlast the universe.`,
      codeLine: line('shared = B ^ x mod p'),
      variables: { tries: found, found, shared },
    },
    [...keyed, ...eve(both, `a = ${found}`, String(shared))],
  );
  return steps;

  function middleSteps(): Step[] {
    const m = MALLORY_SECRETS.find((secret) => secret !== a && secret !== b)!;
    const M = modPow(g, m, p);
    const aliceKey = modPow(M, a, p);
    const bobKey = modPow(M, b, p);
    const row = (party: string, publicText: string, secret: string, key = UNKNOWN): Row => ({ party, values: [publicText, secret, key] });
    const known = (aliceSees: string, bobSees: string, aliceHas = UNKNOWN, bobHas = UNKNOWN, mallory = UNKNOWN): Row[] => [
      row('Alice', aliceSees, `a = ${a}`, aliceHas),
      row('Bob', bobSees, `b = ${b}`, bobHas),
      row('Mallory', `M = ${M}`, `m = ${m}`, mallory),
    ];
    const out: Step[] = [];
    const push = (step: Omit<Step, 'view'>, rows: Row[], messages: Parameters<typeof view>[1]) => {
      log.push(step.title);
      out.push({ ...step, view: view(rows, messages) });
    };
    push(
      {
        title: `Mallory catches A = ${A} and sends M = ${M} to Bob instead`,
        why: 'Mallory sits on the network and can change messages, not only read them. Bob has no way to tell whose number this is.',
        codeLine: line('M = g ^ m mod p'),
        variables: { A, M },
      },
      known(UNKNOWN, `M = ${M}`),
      [
        { from: 'client', to: 'attacker', label: `A = ${A}`, role: 'active' },
        { from: 'attacker', to: 'server', label: `M = ${M}`, role: 'swap' },
      ],
    );
    push(
      {
        title: `Mallory catches B = ${B} and sends M = ${M} to Alice instead`,
        why: 'Alice receives a number that looks like any other share.',
        codeLine: line('M = g ^ m mod p'),
        variables: { B, M },
      },
      known(`M = ${M}`, `M = ${M}`),
      [
        { from: 'server', to: 'attacker', label: `B = ${B}`, role: 'active' },
        { from: 'attacker', to: 'client', label: `M = ${M}`, role: 'swap' },
      ],
    );
    push(
      {
        title: `Alice computes ${M}^${a} mod ${p} = ${aliceKey}`,
        why: 'Alice believes this key is shared with Bob. It is shared with Mallory, who computes the same value from A.',
        codeLine: line('aliceKeyWithMallory'),
        variables: { alice: aliceKey },
      },
      known(`M = ${M}`, `M = ${M}`, String(aliceKey)),
      [],
    );
    push(
      {
        title: `Mallory holds both keys: ${aliceKey} with Alice and ${bobKey} with Bob`,
        why: 'Mallory shares one key with each side, so every message can be decrypted, read or changed, and encrypted again on its way through. Neither side can see this, because a plain exchange never proves who sent a share. That is what signatures add, in the next lesson.',
        codeLine: line('bobKeyWithMallory'),
        variables: { alice: aliceKey, bob: bobKey },
      },
      known(`M = ${M}`, `M = ${M}`, String(aliceKey), String(bobKey), `${aliceKey}, ${bobKey}`),
      [],
    );
    return out;
  }
}
