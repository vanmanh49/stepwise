import type { FoundScript } from './html';
import { hostOf, originOf } from './http';

/** Handlers and javascript: links count as inline, and a nonce can never cover them. */
export function allowsScript(policy: string | undefined, script: FoundScript, pageOrigin: string, url = ''): { allowed: boolean; rule?: string } {
  const directives = (policy ?? '').split(';').map((directive) => directive.trim().split(/\s+/));
  const directive = directives.find(([name]) => name === 'script-src') ?? directives.find(([name]) => name === 'default-src');
  if (!directive) return { allowed: true };

  const sources = directive.slice(1);
  const nonced = script.nonce !== undefined && sources.includes(`'nonce-${script.nonce}'`);
  // A nonce or hash in the policy tells a browser to ignore 'unsafe-inline'.
  const unsafeInline = sources.includes("'unsafe-inline'") && !sources.some((source) => source.startsWith("'nonce-"));
  const fromAllowedHost = (sources.includes("'self'") && originOf(url) === pageOrigin) || sources.includes(originOf(url)) || sources.includes(hostOf(url));

  const allowed = script.kind === 'external' ? nonced || fromAllowedHost : script.kind === 'inline' ? nonced || unsafeInline : unsafeInline;
  return allowed ? { allowed } : { allowed, rule: directive.join(' ') };
}
