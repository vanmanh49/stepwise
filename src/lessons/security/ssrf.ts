import { DEFENSE_OPTIONS, ssrfCode, ssrfSteps } from '../../security/scenarios/ssrf';
import type { LessonContent } from '../../types/lesson';

const [NONE, BLOCKLIST, ALLOW_LIST] = DEFENSE_OPTIONS;
const METADATA = 'http://169.254.169.254/latest/credentials';
const defaults = { input: METADATA, defense: NONE! };
const start = ssrfSteps({ input: METADATA, defense: BLOCKLIST! })[0]!;

const content: LessonContent = {
  overview:
    'Many apps fetch an address for you: a link preview, an image import, a webhook. The request comes from the server, which sits inside the network and can reach things you can\'t. If you choose the address, you can point the server at itself. Here you do that with a shop\'s preview feature, and read fake cloud keys. Every address stays inside the simulation.',
  concept: [
    'Server-side request forgery turns a server into a proxy. A firewall that keeps the outside world away from an internal service does nothing here, because the request comes from inside.',
    'The classic target is the cloud metadata service. On many clouds, a server can ask 169.254.169.254 for its own temporary credentials. If an app will fetch any address, an attacker can read those credentials through it.',
    'A blocklist of bad addresses is easy to get around. The same service may have another name, and a redirect from a site the attacker owns gets past a check that only reads the first address.',
    'An allow-list starts from the other side: it names the hosts a feature may use, and refuses the rest. It has to apply to every hop, so the simplest rule is to follow no redirects.',
    'Hosts on this kind of list can still change where they point, through DNS. So a strong check resolves the name, checks the address, and connects to that address and no other. This lesson leaves that out.',
    'In production, send these requests through an egress proxy that can\'t reach internal addresses, require session tokens for metadata requests (such as AWS IMDSv2), which a plain forged GET can\'t get, and give the server only the permissions it needs. Network rules and the app\'s own checks each cover what the other misses.',
  ],
  howItWorks: [
    'A feature takes an address from the user.',
    'The server checks it, if it checks at all.',
    'The server fetches it, from inside the network.',
    'A redirect can move the request to a new address.',
    'The answer comes back to the user, whatever it holds.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'input', label: 'Address', type: 'text', sample: defaults.input, help: '1 to 120 bytes. Only simulated hosts answer, so a real address gives a network error.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'What the shop checks before it fetches.' },
    ],
    presets: [
      { label: 'Cloud metadata', values: defaults },
      { label: 'A name past the blocklist', values: { input: 'http://metadata.internal/latest/credentials', defense: BLOCKLIST! } },
      { label: 'A redirect past the blocklist', values: { input: 'https://evil.example/go', defense: BLOCKLIST! } },
      { label: 'Allow-list', values: { input: METADATA, defense: ALLOW_LIST! } },
      { label: 'A normal picture', values: { input: 'https://images.example/cat.png', defense: ALLOW_LIST! } },
      { label: 'A redirect from an allowed host', values: { input: 'https://images.example/moved', defense: ALLOW_LIST! } },
    ],
    generate: ssrfSteps,
    codeLabel: 'Pseudocode',
  },
  code: ssrfCode,
  prosCons: {
    pros: ['An allow-list refuses addresses nobody thought of', 'An egress proxy protects every feature at once', 'Metadata session tokens stop the simplest theft'],
    cons: ['Features that fetch any address can\'t use a short list', 'Each redirect is another chance to get it wrong', 'DNS can change after a check'],
    useWhen: ['Any feature that fetches an address a user gave it'],
    avoidWhen: ['Blocking a few bad addresses and calling it done', 'Following redirects without checking each one'],
  },
  applications: [
    'Link previews and image imports',
    'Webhooks that call an address you supply',
    'PDF generators that load a page',
  ],
  commonMistakes: [
    'Checking only the first address, and following its redirects.',
    'Blocking 169.254.169.254 by number, and allowing other names for it.',
    'Giving a server far more cloud permissions than it uses.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This shop uses a blocklist that includes 169.254.169.254, and it was given that address. What happens?',
      view: start.view,
      options: ['403: the shop refuses before any request', 'The shop fetches the credentials', 'The browser blocks it', 'The metadata service refuses'],
      answer: 0,
      explanation: 'The exact address is on the list. The other names and redirects are what it misses.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does a firewall not stop SSRF?',
      options: ['The request comes from a server inside the network', 'Firewalls only watch email', 'SSRF uses no network', 'It encrypts the request'],
      answer: 0,
      explanation: 'Firewalls usually keep the outside out. Here the inside is doing the asking.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'How does an attacker get past this check?',
      code: "if (host(url) == '169.254.169.254') return 403\nanswer = fetchFollowingRedirects(url)",
      options: ['Give it a page on another site that redirects to the metadata address', 'Send a POST', 'Use an image', 'It can\'t be beaten'],
      answer: 0,
      explanation: 'The check reads the first address only, and the redirect happens after it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does the allow-list follow no redirects?',
      options: ['A redirect could leave the allowed host for any address', 'Redirects are slow', 'Browsers forbid them', 'They break images'],
      answer: 0,
      explanation: 'An allowed host can answer with a redirect to somewhere internal, so each hop would need the same check.',
    },
  ],
  summary: [
    'SSRF makes a server fetch what you can\'t reach.',
    'Cloud metadata is the classic prize.',
    'Blocklists lose to other names and redirects.',
    'An allow-list refuses everything it doesn\'t name.',
    'Limit the network and the server\'s rights as well.',
  ],
};

export default content;
