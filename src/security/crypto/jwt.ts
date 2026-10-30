// Teaching code: never use this for real data. Use your platform's crypto library.

import { decodeBase64url, encodeBase64url } from './base64url';
import { utf8 } from './bytes';
import { hmac } from './hmac';
import { sign, verify, type RsaKey } from './rsa';

type Json = Record<string, unknown>;

export type TokenParts = { header: Json; payload: Json; signature: string; signedPart: string };

const encodeJson = (value: Json) => encodeBase64url(utf8(JSON.stringify(value)));

const signedPartOf = (header: Json, payload: Json) => `${encodeJson(header)}.${encodeJson(payload)}`;

export const hs256Signature = (signedPart: string, key: Uint8Array): string => encodeBase64url(hmac(key, utf8(signedPart)));

export function signHs256(payload: Json, key: Uint8Array, header: Json = { alg: 'HS256', typ: 'JWT' }): string {
  const signedPart = signedPartOf(header, payload);
  return `${signedPart}.${hs256Signature(signedPart, key)}`;
}

/** Labelled a toy: the small RSA key from Public Keys & Signatures, because many apps must check one provider's key. */
export function signToyRs(payload: Json, key: RsaKey): string {
  const signedPart = signedPartOf({ alg: 'TOY-RS', typ: 'JWT' }, payload);
  return `${signedPart}.${encodeBase64url(utf8(String(sign(signedPart, key))))}`;
}

export function verifyToyRs(token: string, key: { n: number; e: number }): boolean {
  const parts = splitToken(token);
  const bytes = parts && decodeBase64url(parts.signature);
  if (!bytes) return false;
  const text = new TextDecoder().decode(bytes);
  return /^\d+$/.test(text) && verify(parts.signedPart, Number(text), key);
}

export const unsignedToken = (payload: Json): string => `${signedPartOf({ alg: 'none', typ: 'JWT' }, payload)}.`;

function decodeJson(text: string): Json | null {
  const bytes = decodeBase64url(text);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
  } catch {
    return null;
  }
}

/** Decodes a token and checks nothing: the sites choose what to verify, and that choice is what the lessons teach. */
export function splitToken(token: string): TokenParts | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerText, payloadText, signature] = parts as [string, string, string];
  const header = decodeJson(headerText);
  const payload = decodeJson(payloadText);
  return header && payload ? { header, payload, signature, signedPart: `${headerText}.${payloadText}` } : null;
}
