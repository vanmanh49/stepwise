import { ATTACK_LABELS, ATTACK_OPTIONS, certificatesTlsCode, certificatesTlsSteps } from '../../security/scenarios/certificates-tls';
import type { LessonContent } from '../../types/lesson';

const defaults = { attack: ATTACK_OPTIONS[0]! };
const expired = certificatesTlsSteps({ attack: ATTACK_LABELS.expired });
const beforeDate = expired[expired.findIndex((s) => s.title.startsWith('Date check')) - 1]!;

const content: LessonContent = {
  overview:
    'Every https connection combines what the earlier lessons built: key exchange for a shared secret, signatures to prove identity, hashes and HMAC to detect changes, and AES-GCM for the data. This lesson walks through a shortened TLS 1.3 handshake, message by message, then tries four attacks and shows the exact check that stops each one.',
  concept: [
    'Key exchange left one question open: who is on the other end? A certificate answers it. It says "this public key belongs to this name", signed by a certificate authority (CA).',
    'Your device ships with a small list of trusted root CAs. A site\'s certificate is signed by an intermediate CA, and the intermediate by a root. The client follows that chain up to a root it already trusts.',
    'Holding a certificate proves nothing, because certificates are public. So the server also signs the handshake with its private key (CertificateVerify). Then both sides send Finished, an HMAC over everything so far, which proves nobody changed a message.',
    'A connection that fails any check is closed. Nothing is shown to the user or sent to the server, because a partly trusted connection is not safe to use.',
    'This handshake is simplified: certificates are plain objects, not X.509, key derivation is one HKDF step, one key serves both directions, and the numbers are toys. In production, never write this yourself. Use your platform\'s TLS stack, get certificates from an authority such as Let\'s Encrypt, renew them automatically, and never turn certificate checks off.',
  ],
  howItWorks: [
    'ClientHello and ServerHello carry Diffie-Hellman shares, and both ends derive keys.',
    'The server sends its certificate chain and signs the handshake so far.',
    'The client checks the chain up to a trusted root, then the dates, then the name.',
    'Both ends send Finished, an HMAC over the whole conversation.',
    'Data flows as AES-GCM records. Any failed check closes the connection.',
  ],
  visualization: {
    kind: 'form',
    fields: [{ name: 'attack', label: 'Attack', type: 'choice', sample: defaults.attack, options: ATTACK_OPTIONS, help: 'What goes wrong during the handshake.' }],
    presets: ATTACK_OPTIONS.map((attack) => ({ label: attack === ATTACK_OPTIONS[0] ? 'No attack' : attack, values: { attack } })),
    generate: certificatesTlsSteps,
    codeLabel: 'Pseudocode',
  },
  code: certificatesTlsCode,
  prosCons: {
    pros: ['Secrecy, integrity and identity in one protocol', 'Works between strangers with no earlier contact', 'TLS 1.3 sets up in one round trip and allows only strong ciphers'],
    cons: ['Trust rests on every CA in the trust store', 'Certificates must be renewed before they expire', 'Protects data on the wire, not on either end'],
    useWhen: ['Any traffic over a network, including inside your own systems', 'Services must prove their identity to each other (mutual TLS)'],
    avoidWhen: ['Never skip it for "internal" traffic out of convenience', 'Don\'t rely on it alone for data that must stay encrypted at rest'],
  },
  applications: [
    'Every https website and most mobile app traffic',
    'Service meshes use mutual TLS between services',
    'Email, databases and message brokers all offer TLS connections',
  ],
  commonMistakes: [
    'Turning off certificate checks to silence an error, which removes the protection from the attack it exists to stop.',
    'Letting certificates expire because nobody automated the renewal.',
    'Believing the padlock means a site is honest: it only proves you reached that name.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The chain is valid, but this certificate ended on 2025-12-31 and today is 2026-06-01. What does the client do next?',
      view: beforeDate.view,
      options: ['Fails the date check and closes the connection', 'Continues, because the signatures are genuine', 'Asks the server for a newer key share', 'Sends Finished'],
      answer: 0,
      explanation: 'Every check must pass. An expired certificate fails even with a good chain, which limits how long a stolen key is useful.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why can\'t an attacker just replay a site\'s real certificate?',
      options: ['CertificateVerify needs the matching private key', 'Certificates are encrypted', 'Each certificate works only once', 'Root CAs watch every connection'],
      answer: 0,
      explanation: 'Certificates are public. The attacker can copy one, but can\'t sign this handshake without the private key.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which attack does this check stop?',
      code: 'check(cert.subject == hostname)',
      options: ['A genuine certificate for a different site', 'A flipped bit in a record', 'An expired certificate', 'A self-signed certificate'],
      answer: 0,
      explanation: 'An attacker can get a real certificate for a domain they own. This check ensures it is for the name you asked for.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'An attacker flips a bit in an encrypted record after the handshake. What happens?',
      options: ['The GCM tag fails and the connection closes', 'The client reads slightly wrong data', 'The record is decrypted normally', 'The handshake starts again from ClientHello'],
      answer: 0,
      explanation: 'Without the key the attacker can\'t make a matching tag, so the client refuses the record.',
    },
  ],
  summary: [
    'TLS combines key exchange, signatures, HMAC and authenticated encryption.',
    'A certificate ties a public key to a name, and a chain ties it to a trusted root.',
    'The client checks the chain, the dates and the name, and any failure closes the connection.',
    'Use your platform\'s TLS stack, automate renewals, and never disable the checks.',
  ],
};

export default content;
