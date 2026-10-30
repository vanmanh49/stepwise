import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Role, Step } from '../../types/visualization';
import { ROOT_NAME, runHandshake, SCENARIO_DATE, SITE, TLS_ATTACKS, type TlsAttack, type TlsEvent } from '../crypto/tls';
import { EMPTY, partiesView } from '../steps';

export const certificatesTlsCode = `send ClientHello(keyShare)
receive ServerHello(keyShare)
keys = hkdf(diffieHellman(secret, theirShare))
receive Certificate(chain), CertificateVerify(signature)

check(signature.matches(cert.publicKey))               // proves the private key
for (cert of chain) check(issuerOf(cert).signed(cert)) // must reach a trusted root
check(cert.notBefore <= today && today <= cert.notAfter)
check(cert.subject == hostname)

receive Finished; send Finished     // both prove they hold the keys
plain = gcmDecrypt(keys, record)    // a bad tag fails here

onAnyFailure: closeConnection()     // nothing is sent or shown`;

export const ATTACK_LABELS: Record<TlsAttack, string> = {
  none: 'None',
  'self-signed': 'Self-signed certificate',
  'copied-certificate': 'Copied certificate',
  expired: 'Expired certificate',
  'wrong-name': 'Wrong name',
  'tampered-record': 'Tampered record',
};
export const ATTACK_OPTIONS = TLS_ATTACKS.map((attack) => ATTACK_LABELS[attack]);

const line = (snippet: string) => lineOf(certificatesTlsCode, snippet);
const NAME: Record<string, string> = { client: 'Client', attacker: 'Attacker', server: 'Server' };

const CHECK_NAME = { proof: 'Proof', chain: 'Chain', date: 'Date', name: 'Name', record: 'Record' };

const CLOSE_WHY: Record<keyof typeof CHECK_NAME, string> = {
  proof: 'The certificate is genuine, and because certificates are public the attacker could copy it. But the signature does not match its public key, because the private key stayed with the real server.',
  chain: `The chain never reaches ${ROOT_NAME}, the only root this client trusts. Anyone can make a certificate that claims to be ${SITE}. What matters is who vouches for it.`,
  date: 'The signatures are genuine, but the certificate ran out. Dates limit how long a stolen private key stays useful.',
  name: `The certificate is genuine, but it is for another site. A certificate only proves one name, so the client asked for ${SITE} and got something else.`,
  record: 'The attacker can flip a bit but has no key, so they cannot make a matching tag. GCM refuses the record, and the client never sees the changed data.',
};

function titleOf(event: TlsEvent, peer: string): string {
  const { values } = event;
  switch (event.id) {
    case 'client-hello':
      return `Client sends ClientHello with key share ${values.share}`;
    case 'server-hello':
      return `${peer} answers with ServerHello and key share ${values.share}`;
    case 'keys':
      return `Both ends derive keys: ${values.key!.slice(0, 8)}…`;
    case 'certificate':
      return `${peer} sends a certificate for ${values.subject}, issued by ${values.issuer}`;
    case 'certificate-verify':
      return `${peer} signs the handshake so far: ${values.signature}`;
    case 'chain-check':
      return event.ok ? `Chain check: ${values.issuer} signed ${values.subject}` : `Chain check: ${values.issuer} is not trusted`;
    case 'date-check':
      return `Date check: valid until ${values.notAfter}, and today is ${SCENARIO_DATE} in this scenario`;
    case 'name-check':
      return `Name check: the certificate names ${values.subject}`;
    case 'server-finished':
      return `${peer} sends Finished`;
    case 'client-finished':
      return 'Client sends Finished';
    case 'record':
      return `${peer} sends an encrypted record: ${values.ciphertext!.slice(0, 12)}…`;
    default:
      return 'The connection is closed';
  }
}

const WHY: Record<TlsEvent['id'], string> = {
  'client-hello': 'TLS 1.3 sends a Diffie-Hellman share in the very first message, so the rest of the handshake can already be encrypted.',
  'server-hello': 'With both shares, each end can compute the same secret, exactly as in the Key Exchange lesson.',
  keys: 'HKDF stretches the shared secret into the keys for encryption and for the Finished messages. Real TLS 1.3 derives more keys, with one for each direction.',
  certificate: 'The certificate says "this public key belongs to this name", signed by an authority. It answers what key exchange could not: who is on the other end?',
  'certificate-verify': 'A certificate is public, so anyone could send a copy. This signature over the conversation proves the sender also holds the matching private key.',
  'chain-check': 'Each certificate must be signed by the next one up, ending at a root already in the client\'s trust store.',
  'date-check': 'A certificate is only valid between its two dates. The client compares them with today.',
  'name-check': `The client asked for ${SITE}, so the certificate must name exactly that.`,
  'server-finished': 'Finished is an HMAC over the whole conversation, keyed from the shared secret. If anyone had changed a message, the two ends would disagree here.',
  'client-finished': 'The client proves the same thing, and the handshake is complete.',
  record: 'From here on, data travels as AES-GCM records.',
  closed: '',
};

const LINE: Record<TlsEvent['id'], string> = {
  'client-hello': 'send ClientHello',
  'server-hello': 'receive ServerHello',
  keys: 'keys = hkdf',
  certificate: 'receive Certificate',
  'certificate-verify': 'check(signature.matches',
  'chain-check': 'for (cert of chain)',
  'date-check': 'check(cert.notBefore',
  'name-check': 'check(cert.subject',
  'server-finished': 'receive Finished',
  'client-finished': 'receive Finished',
  record: 'plain = gcmDecrypt',
  closed: 'onAnyFailure',
};

const TITLE = "Can't run this handshake";

export function certificatesTlsSteps(values: Record<string, string>): Step[] {
  const choice = readChoice(values, 'attack', 'Attack', ATTACK_OPTIONS);
  if (!choice.ok) return refusal(TITLE, choice.why, EMPTY);
  const attack = TLS_ATTACKS[ATTACK_OPTIONS.indexOf(choice.value)]!;
  const { events, stoppedAt, plaintext } = runHandshake(attack);
  const hasAttacker = attack !== 'none';
  const peer = attack === 'none' || attack === 'tampered-record' ? 'Server' : 'Attacker';
  const log: string[] = [];
  let key = '–';
  let passed = 0;

  return events.map((event) => {
    if (event.id === 'keys') key = `${event.values.key!.slice(0, 8)}…`;
    if (event.id.endsWith('-check') && event.ok) passed++;
    const closing = event.id === 'closed' && stoppedAt !== undefined;
    const lastRecord = event.id === 'record' && plaintext !== undefined;
    const title = closing
      ? `${CHECK_NAME[stoppedAt]} check failed: connection closed`
      : lastRecord
        ? `Client decrypts the record: "${plaintext}"`
        : titleOf(event, peer);
    log.push(title);

    const on = (from: string, to: string) => ({ from, to, label: event.id.replaceAll('-', ' '), role: 'active' as Role });
    const { from, to } = event;
    const passesThrough = hasAttacker && from !== undefined && to !== undefined && from !== 'attacker' && to !== 'attacker';
    const messages = from === undefined || to === undefined ? [] : passesThrough ? [on(from, 'attacker'), on('attacker', to)] : [on(from, to)];

    const rows = [
      { party: 'Client', values: [key, String(passed)] },
      ...(attack === 'tampered-record' ? [{ party: 'Attacker', values: ['–', '–'] }] : []),
      { party: NAME[peer === 'Server' ? 'server' : 'attacker']!, values: [key, '–'] },
    ];
    return {
      title,
      why: closing ? CLOSE_WHY[stoppedAt] : WHY[event.id],
      codeLine: line(LINE[event.id]),
      variables: { event: event.id, checks: passed },
      view: partiesView({ attacker: hasAttacker, messages, known: rows, columns: ['Key', 'Checks passed'], log: log.slice(-4) }),
    };
  });
}
