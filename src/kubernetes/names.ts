import type { Ctx } from './controllers/types';
import type { Kind } from './model';

// The characters Kubernetes uses for generated names: no vowels, no look-alike digits.
const ALPHABET = 'bcdfghjklmnpqrstvwxz2456789';

function unique(ctx: Ctx, kind: Kind, prefix: string, length: number, taken: Set<string>): string {
  for (;;) {
    let suffix = '';
    for (let i = 0; i < length; i++) suffix += ALPHABET[Math.floor(ctx.rng() * ALPHABET.length)];
    const name = `${prefix}-${suffix}`;
    if (!taken.has(name) && !ctx.store.get(kind, name)) {
      taken.add(name);
      return name;
    }
  }
}

/** `${owner}-` plus 3 seeded characters; `taken` holds names handed out in this pass but not stored yet. */
export const podName = (ctx: Ctx, owner: string, taken = new Set<string>()) => unique(ctx, 'Pod', owner, 3, taken);

export const replicaSetName = (ctx: Ctx, deployment: string, taken = new Set<string>()) => unique(ctx, 'ReplicaSet', deployment, 2, taken);
