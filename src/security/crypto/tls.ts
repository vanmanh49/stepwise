// Teaching code: never use this for real data. Use your platform's crypto library.

import { hex, utf8 } from './bytes';
import { hkdfExpand, hkdfExtract, hmac } from './hmac';
import { gcmDecrypt, gcmEncrypt } from './modes';
import { GROUPS, modPow } from './numbers';
import { keyPair, sign, verify, type RsaKey } from './rsa';
import { sha256 } from './sha256';

export const TLS_ATTACKS = ['none', 'self-signed', 'copied-certificate', 'expired', 'wrong-name', 'tampered-record'] as const;
export type TlsAttack = (typeof TLS_ATTACKS)[number];

export type Certificate = { subject: string; issuer: string; notBefore: string; notAfter: string; publicKey: { n: number; e: number }; signature: number };

type Party = 'client' | 'attacker' | 'server';

export type TlsEvent = {
  id: 'client-hello' | 'server-hello' | 'keys' | 'certificate' | 'certificate-verify' | 'chain-check' | 'date-check' | 'name-check' | 'server-finished' | 'client-finished' | 'record' | 'closed';
  from?: Party;
  to?: Party;
  ok: boolean;
  detail: string;
  values: Record<string, string>;
};

export const SITE = 'shop.example';
export const SCENARIO_DATE = '2026-06-01';
export const RECORD_TEXT = 'Your order #4217 has shipped';
export const ROOT_NAME = 'Stepwise Root CA';
const ISSUING_NAME = 'Stepwise Issuing CA';

const key = (p: number, q: number) => keyPair(p, q, 17)!;
const ROOT_KEY = key(883, 997);
const ISSUING_KEY = key(691, 809);
const LEAF_KEY = key(557, 719);
const ATTACKER_KEY = key(419, 631);
const TRUST_STORE = [{ subject: ROOT_NAME, publicKey: { n: ROOT_KEY.n, e: ROOT_KEY.e } }];

const GROUP = GROUPS[2]!;
const CLIENT_SECRET = 12345;
const SERVER_SECRET = 54321;
const ATTACKER_SECRET = 6789;

/** Everything a signature covers: the certificate with its signature blanked. */
const signedPart = (cert: Certificate) => JSON.stringify({ ...cert, signature: 0 });

function certificate(subject: string, issuer: string, subjectKey: RsaKey, issuerKey: RsaKey, notBefore = '2026-01-01', notAfter = '2026-12-31'): Certificate {
  const fields = { subject, issuer, notBefore, notAfter, publicKey: { n: subjectKey.n, e: subjectKey.e }, signature: 0 };
  return { ...fields, signature: sign(signedPart(fields), issuerKey) };
}

const ISSUING_CERTIFICATE = certificate(ISSUING_NAME, ROOT_NAME, ISSUING_KEY, ROOT_KEY);

/** What the party answering the client presents, and the private key it can sign with. */
function presented(attack: TlsAttack): { chain: Certificate[]; signingKey: RsaKey; secret: number; from: Party } {
  const attacker = { secret: ATTACKER_SECRET, from: 'attacker' as const };
  if (attack === 'self-signed') return { ...attacker, chain: [certificate(SITE, SITE, ATTACKER_KEY, ATTACKER_KEY)], signingKey: ATTACKER_KEY };
  if (attack === 'copied-certificate') return { ...attacker, chain: [certificate(SITE, ISSUING_NAME, LEAF_KEY, ISSUING_KEY), ISSUING_CERTIFICATE], signingKey: ATTACKER_KEY };
  if (attack === 'expired') return { ...attacker, chain: [certificate(SITE, ISSUING_NAME, LEAF_KEY, ISSUING_KEY, '2025-01-01', '2025-12-31'), ISSUING_CERTIFICATE], signingKey: LEAF_KEY };
  if (attack === 'wrong-name') return { ...attacker, chain: [certificate('evil.example', ISSUING_NAME, ATTACKER_KEY, ISSUING_KEY), ISSUING_CERTIFICATE], signingKey: ATTACKER_KEY };
  return { chain: [certificate(SITE, ISSUING_NAME, LEAF_KEY, ISSUING_KEY), ISSUING_CERTIFICATE], signingKey: LEAF_KEY, secret: SERVER_SECRET, from: 'server' };
}

/** Certificates list their issuer next, and the root must already be in the client's trust store. */
function issuerOf(chain: Certificate[], index: number): { n: number; e: number } | undefined {
  const name = chain[index]!.issuer;
  const next = chain[index + 1];
  if (next?.subject === name) return next.publicKey;
  return TRUST_STORE.find((entry) => entry.subject === name)?.publicKey;
}

/** Key derivation is one HKDF step here; real TLS 1.3 runs a longer schedule with a key per direction. */
function deriveKeys(sharedSecret: number) {
  const secret = new Uint8Array(4);
  new DataView(secret.buffer).setUint32(0, sharedSecret);
  const prk = hkdfExtract(new Uint8Array(0), secret);
  return { key: hkdfExpand(prk, utf8('key'), 16), iv: hkdfExpand(prk, utf8('iv'), 12), finished: hkdfExpand(prk, utf8('finished'), 32) };
}

export function runHandshake(attack: TlsAttack): {
  events: TlsEvent[];
  stoppedAt?: 'proof' | 'chain' | 'date' | 'name' | 'record';
  clientKey?: Uint8Array;
  serverKey?: Uint8Array;
  plaintext?: string;
} {
  const events: TlsEvent[] = [];
  const peer = presented(attack);
  const { from } = peer;
  let transcript = '';
  const send = (event: TlsEvent) => {
    events.push(event);
    transcript += `${event.id}:${JSON.stringify(event.values)}\n`;
  };
  const stop = (stoppedAt: 'proof' | 'chain' | 'date' | 'name' | 'record', detail: string) => {
    events.push({ id: 'closed', from: 'client', ok: false, detail, values: {} });
    return { events, stoppedAt };
  };

  const clientShare = modPow(GROUP.g, CLIENT_SECRET, GROUP.p);
  const peerShare = modPow(GROUP.g, peer.secret, GROUP.p);
  send({ id: 'client-hello', from: 'client', to: from, ok: true, detail: 'Client sends its key share.', values: { share: String(clientShare) } });
  send({ id: 'server-hello', from, to: 'client', ok: true, detail: 'Peer answers with its key share.', values: { share: String(peerShare) } });

  const clientKeys = deriveKeys(modPow(peerShare, CLIENT_SECRET, GROUP.p));
  const peerKeys = deriveKeys(modPow(clientShare, peer.secret, GROUP.p));
  events.push({ id: 'keys', ok: true, detail: 'Both sides derive keys from the shared secret.', values: { key: hex(clientKeys.key) } });

  const leaf = peer.chain[0]!;
  send({
    id: 'certificate',
    from,
    to: 'client',
    ok: true,
    detail: `Peer presents ${peer.chain.length} certificate(s).`,
    values: { subject: leaf.subject, issuer: leaf.issuer, notBefore: leaf.notBefore, notAfter: leaf.notAfter, publicKey: `${leaf.publicKey.n}, ${leaf.publicKey.e}` },
  });

  const signedHash = hex(sha256(utf8(transcript)));
  const proof = sign(signedHash, peer.signingKey);
  const proven = verify(signedHash, proof, leaf.publicKey);
  send({ id: 'certificate-verify', from, to: 'client', ok: proven, detail: 'Peer signs the conversation so far, proving it holds the private key.', values: { signature: String(proof) } });
  if (!proven) return stop('proof', 'Client closes: the peer does not hold the certificate\'s private key.');

  for (const [index, cert] of peer.chain.entries()) {
    const issuerKey = issuerOf(peer.chain, index);
    const ok = issuerKey !== undefined && verify(signedPart(cert), cert.signature, issuerKey);
    events.push({
      id: 'chain-check',
      ok,
      detail: ok ? `${cert.issuer} signed ${cert.subject}.` : `${cert.issuer} is not a trusted issuer of ${cert.subject}.`,
      values: { subject: cert.subject, issuer: cert.issuer },
    });
    if (!ok) return stop('chain', 'Client closes: the certificate chain does not reach a trusted root.');
  }

  const inDate = leaf.notBefore <= SCENARIO_DATE && SCENARIO_DATE <= leaf.notAfter;
  events.push({ id: 'date-check', ok: inDate, detail: `Valid ${leaf.notBefore} to ${leaf.notAfter}; today is ${SCENARIO_DATE}.`, values: { notBefore: leaf.notBefore, notAfter: leaf.notAfter } });
  if (!inDate) return stop('date', 'Client closes: the certificate has expired.');

  const rightName = leaf.subject === SITE;
  events.push({ id: 'name-check', ok: rightName, detail: `Certificate names ${leaf.subject}; client asked for ${SITE}.`, values: { subject: leaf.subject } });
  if (!rightName) return stop('name', 'Client closes: the certificate is for a different site.');

  const finished = (keys: { finished: Uint8Array }) => hex(hmac(keys.finished, sha256(utf8(transcript))));
  const serverFinished = finished(peerKeys);
  const expected = finished(clientKeys);
  send({ id: 'server-finished', from, to: 'client', ok: serverFinished === expected, detail: 'Peer proves it derived the same keys.', values: { mac: serverFinished } });
  const clientFinished = finished(clientKeys);
  send({ id: 'client-finished', from: 'client', to: from, ok: clientFinished === finished(peerKeys), detail: 'Client proves the same.', values: { mac: clientFinished } });

  const sealed = gcmEncrypt(peerKeys.key, peerKeys.iv, utf8(RECORD_TEXT));
  const ciphertext = sealed.ciphertext.slice();
  if (attack === 'tampered-record') ciphertext[0]! ^= 1;
  const opened = gcmDecrypt(clientKeys.key, clientKeys.iv, ciphertext, sealed.tag);
  events.push({
    id: 'record',
    from,
    to: 'client',
    ok: opened !== null,
    detail: opened ? 'Client decrypts the record.' : 'The GCM tag does not match.',
    values: { ciphertext: hex(ciphertext), tag: hex(sealed.tag) },
  });
  if (!opened) return stop('record', 'Client closes: the record was changed in transit.');

  return { events, clientKey: clientKeys.key, serverKey: peerKeys.key, plaintext: new TextDecoder().decode(opened) };
}
