# Security track, phase 3: web attacks and defenses

Date: 2026-10-30
Status: approved design, awaiting spec review

## Goal

Make the 8 **Web Attacks & Defenses** topics live on the simulated web app from phase 2, which finishes the Security track at 23 lessons. A learner who finishes phase 3 can say why an input is dangerous, which fix belongs where, and why one control is never enough.

## Decisions

- **Typed payloads** (the user's choice). In SQL Injection, Command Injection, Cross-Site Scripting, Content Security Policy and SSRF, a text field goes straight into the simulated app, with a preset for each classic attack. A learner's own variation behaves as it would, for real reasons.
- **No real code runs.** Typed HTML goes through a small tokenizer, and typed scripts through a small language with a fixed set of forms. There is no `eval`, no `new Function`, no `innerHTML`, no iframe and no network. Typed text only ever reaches the screen as text.
- **Threat Modeling is an attack chain against layers** (the user's choice): one attack runs end to end, and the learner turns layers on to see where it breaks.
- **Everything runs against simulated parties in the page.** A typed URL can only reach the simulated sites. Any other host gives a recorded network error, and nothing here can be pointed at a real site.
- **Every attack lesson shows the attack working, then the defense stopping it.** Where a weak defense exists, the lesson shows that too: blocklists are beaten.
- **No new view kind and no new input kind.**
- One spec, one plan, one PR on branch `security-phase-3`, inside the `stepwise` folder (no worktree). Ask before merging.

## 1. Page model (`src/security/web/`)

No React. Entry points never throw. Nothing reads the clock or `Math.random`.

### `html.ts`

`parseHtml(text)` returns `{ tags, text }`, where each tag has a lowercase `name` and its `attributes`. It handles upper and lower case, single, double and missing attribute quotes, and unclosed tags. `escapeHtml(text)` replaces `&`, `<`, `>`, `"` and `'`. `findScripts(html, sink)` returns the scripts a page would run:

| Source | Runs when |
|---|---|
| `<script>` with text | `sink` is `page` |
| `<script src=...>` | `sink` is `page`, fetched from a simulated site |
| `onerror` on `img`, `onload` on `svg` or `body` | always, with no click |
| any other `on...` handler, `href="javascript:..."` | never here: the step says it would wait for a click |

`sink` is `page` for HTML the server sent, and `inner` for HTML set through `innerHTML`, where `<script>` tags stay inert, as in real browsers.

### `pageScript.ts`

`parsePageScript(text)` accepts one or more statements separated by `;`. Anything else gives `{ ok: false, why }`, and the step says the simulation does not understand it.

- Statements: `alert(value)`, `fetch(value)`, `location = value` (also `location.href`, `document.location`), `new Image().src = value`.
- Values: quoted text, `document.cookie`, `location.href`, and any of those joined with `+`.

`document.cookie` comes from `browser.runScript(origin)`, so `HttpOnly` applies.

### `shell.ts`

`runShell(line, files)` parses `;`, `&&`, `|` and `$(...)`, with `$(...)` nested at most 3 deep. Commands are `ping`, `cat`, `ls`, `whoami`, `id` and `echo`, over a fixed fake filesystem: `/var/www/files`, `/etc/passwd`, `/app/.env`. Unknown commands give "command not found". `resolvePath(base, path)` normalises `.` and `..`.

## 2. Browser changes (`browser.ts`)

- **Top-level or not.** `Lax` cookies go with a cross-site GET only on a top-level navigation. Phase 2's `visit` is a navigation. `fetchFrom` and `<img>` requests are subresources, which send only `SameSite=None` cookies across sites.
- **`origin` header** on every POST and PUT, and on cross-origin `fetchFrom` requests. An `<img>` GET has none.
- **`loadPage(url, initiator?)`** visits a page, reads its `content-security-policy` header, finds its scripts, and runs each allowed one in the page's origin. It returns each script's source, what it did, and which rule blocked it if any.
- **`fetchFrom(origin, url, options)`** is a page's `fetch`, with `method`, `credentials` and `headers`. It enforces the same-origin policy and CORS: a simple request is sent and its response is hidden from the page unless `access-control-allow-origin` allows it. A `PUT` or custom header sends an `OPTIONS` preflight first. `*` is refused for a credentialed read.
- **CSP** covers `default-src` and `script-src`, with `'self'`, `'unsafe-inline'`, `'nonce-...'` and hosts. A page's own script carries the nonce.
- **Two fixes from the phase 2 review:** a cookie `path` matches on a segment boundary, so `/admin` no longer matches `/administrator`, and a `Secure` cookie can't be set or overwritten from `http:`.

The other differences listed in the phase 2 review stay as they are, since no lesson depends on them: no `Lax`+POST exception, `http`→`https` counts as same-site, and domain cookies are keyed by the setting host.

## 3. App changes

- `http.ts`: `WebRequest.method` adds `PUT` and `OPTIONS`.
- `site.ts`: `Site` gains optional `hosts`, the other names it answers to. `Party` and `NodeId` add `internal`.
- `db.ts`: `ShopDb.execute(sql)` returns `{ ok, rows, error }`, keeps any writes, and runs every statement, so a stacked `DROP` works.
- `internal.ts`: `createInternal()`, a site reached only from the server, on `http://metadata.internal`, `http://169.254.169.254` and `http://admin.internal`. It returns fake cloud credentials. `images.example` is the one host on the shop's preview allow-list.
- `evil.ts` gains `GET /c`, which keeps what a script sends in its query, `GET /go`, a redirect to the metadata address, `GET /x.js`, a script in the page language, and `POST /drop`, which keeps what it receives.
- `shop.ts` gains these options and routes:

| Option | Values | Routes it affects |
|---|---|---|
| `queries` | `string`, `blocklist`, `parameters` | `POST /signin`, `GET /search?q=` |
| `commands` | `shell`, `blocklist`, `noShell` | `GET /ping?host=`, `GET /download?file=` |
| `encode` | boolean | `GET /search`, `GET /comments`, `POST /comments`, `GET /welcome` |
| `csp` | `none`, `unsafeInline`, `nonce` | every page |
| `cookie.sameSite` | `Strict`, `Lax`, `None` | the session cookie |
| `cors` | `none`, `one`, `reflect`, `wildcard` | `GET /account`, `PUT /account` |
| `csrf` | `none`, `token`, `origin` | `POST /orders`, `GET /orders/new` |
| `preview` | `open`, `blocklist`, `allowList` | `GET /preview?url=` |
| `egress` | boolean | `POST /admin/export?to=` |

`GET /welcome` puts `location.hash` into the page with `innerHTML`, or with `textContent` when `encode` is on. Every new option is safe by default in `SAFE_SHOP`, as in phase 2. `GET /orders/new` changes state on a GET on purpose, because that is the flaw the image attack needs.

**Parameters.** The interpreter has no bound parameters, so `parameters` uses the `sql` helper, which quotes values. The lesson says so: real drivers send the values apart from the query.

**Blocklists are real ones that really fail.** `queries: blocklist` refuses the exact text `OR`, `UNION` and `--`, so lower case gets through. `commands: blocklist` refuses `;` and `&&`, so `|` gets through, and strips `../` once, so `....//` gets through. `preview: blocklist` refuses `localhost`, `127.0.0.1` and `169.254.169.254`, so `metadata.internal` and a redirect through `evil.example/go` get through.

## 4. Lessons

Each lesson is a `form` visualization with `codeLabel: 'Pseudocode'`, 4 quiz questions of at least 3 types, one `predict-next` from a real step, and a last `concept` paragraph on real practice that contains the word "production". Difficulty is `advanced`, the group is `Web Attacks & Defenses`, and each lesson has one preset per attack, starting with the attack working.

| Lesson (id) | Fields | What the learner watches |
|---|---|---|
| Same-Origin & CORS (`same-origin-cors`) | `attack` (Read my account, Change my account), `cors` (None, One origin, Reflect any, Wildcard) | A page on `evil.example` calls the shop, with the session cookie set to `SameSite=None`. The request arrives and the response comes back, and the browser decides whether the page may read it. One origin allows only `https://app.shop.example`. Reflect any plus credentials gives the attacker alice's data. Wildcard is refused for credentialed reads, and the text says it is fine for public data. A failed preflight stops the `PUT` before it is sent |
| SQL Injection (`sql-injection`) | `query` (Sign-in, Search), `input`, `defense` (String building, Blocklist, Parameters) | The final query, then what it returned. Sign-in puts `input` in the name, with a wrong password, on a shop using unsalted SHA-256 so the hash can sit in the query. Search runs `SELECT item, total, owner FROM orders WHERE item LIKE '%q%'`. `alice' --` signs in with no password, `' UNION SELECT name, hash, role FROM users --` steals hashes, and a stacked `'; DROP TABLE orders --` deletes a table. A SQL error is shown as the shop's page would show it. The text says many real drivers refuse stacked statements |
| Command Injection & Path Traversal (`command-injection`) | `feature` (Ping, Download), `input`, `defense` (Shell string, Blocklist, No shell + allow-list) | The command as the shell parsed it, or the path as it resolved. `8.8.8.8; cat /app/.env` runs a second command, and `../../etc/passwd` leaves the folder |
| Cross-Site Scripting (`cross-site-scripting`) | `where` (Reflected, Stored, DOM), `input`, `defense` | The payload reaches the page as markup, and its action runs: the cookie goes to `evil.example`. Encoding turns it back into text. In the DOM case `<script>` stays inert and `<img src=x onerror=...>` runs |
| Content Security Policy (`content-security-policy`) | `policy` (None, `unsafe-inline`, Nonce), `input` | The same injected script, sent to `/search` with encoding off, allowed or blocked by a named rule. `unsafe-inline` stops an outside script and not an inline one. Nonce stops both and the page's own script still runs. The markup is still in the page, so CSP is a second line |
| CSRF (`csrf`) | `attack` (Auto-submitted form, Image tag), `defense` (None, SameSite, Token, Origin check) | `evil.example` places an order in alice's name. Off means `SameSite=None`. The Origin check does not stop the image GET, which has no `origin` header, and the step says so: GET must not change state |
| SSRF (`ssrf`) | `input` (a URL), `defense` (None, Blocklist, Allow-list) | The shop fetches the URL from inside the network and returns fake cloud credentials. A redirect beats the blocklist. The allow-list follows no redirects |
| Threat Modeling & Defense in Depth (`threat-modeling`) | `encoding`, `csp`, `httpOnly`, `roleCheck`, `egress` (each `Off`, `On`) | One chain: a stored comment runs in alice's browser, the script sends the cookie out, the attacker opens `/admin`, and `POST /admin/export` sends the users table to `evil.example`. The run stops at the first layer that holds, then lists which later layers would also have held |

A last step's `variables.result` is `attacker in` or `stopped`, as in phase 2. For Threat Modeling, `variables.stage` also names how far the attack got.

Prerequisites: `same-origin-cors` needs `sessions-cookies`. `sql-injection` needs `password-storage`. `command-injection` needs `sql-injection`. `cross-site-scripting` needs `same-origin-cors`. `content-security-policy` needs `cross-site-scripting`. `csrf` needs `same-origin-cors`. `ssrf` needs `access-control`. `threat-modeling` needs `content-security-policy`, `csrf` and `ssrf`.

### Invalid input

Bad knobs return one explanatory step through `refusal`, as before:

- `input` empty or over 120 bytes, or holding emoji, through `readBytes`;
- any `choice` value outside its options.

A typed payload that fails to parse is not invalid input. It is a run: the step shows the SQL error, or says the page language or shell does not understand it.

## 5. Testing

- A payload corpus per typed lesson, each with its expected result for each defense, including the blocklist bypasses.
- `html.ts`: a table of markup cases covering case, quotes, missing quotes, unclosed tags and each row of the script table above, including `<script>` inert under `inner`.
- `pageScript.ts`: every statement and value form, plus text it must refuse, such as `eval('x')`.
- `shell.ts`: each operator, the nesting limit, unknown commands, and `resolvePath` with `..` past the root.
- `browser.ts`: tables for subresource `SameSite`, CSP sources, and every CORS case (simple, preflighted, credentialed, wildcard). Tests for the two path and `Secure` fixes.
- One test per attack: it works with the defense off and is stopped with it on. CSRF is tested for every attack and defense pair, including the Origin check that fails.
- Threat Modeling is tested for all 32 layer settings: the stopping layer is the earliest that is on, and all off reaches the last stage.
- `src/security/contract.test.ts` gains hostile text for text fields, such as unbalanced quotes, `<`, `$(`, `%`, and a deep `$(` chain. No run throws, and each stays within `MAX_STEPS`.
- A source check that `src/security/web/` contains no `eval(`, `new Function` or `.innerHTML =`. Lesson pseudocode may show those words, so scenarios are not checked. `src/components/` is checked for no new `dangerouslySetInnerHTML`.
- `npm run check:bundle` stays under 600 kB. The new modules load with the lesson chunks.
- By hand in a browser: every lesson at 375 px and 1024 px, in both themes, with each preset and a payload typed by hand. Check that a typed `<img src=x onerror=alert(1)>` shows as text and fires no real dialog.

## Touch points

`src/security/web/**`, `src/security/scenarios/*`, `src/lessons/security/*`, `src/lessons/meta/security.ts`, `src/lessons/lessons.test.ts`, `scripts/static-pages.test.ts` (lesson count), `src/security/contract.test.ts`, README.md and CLAUDE.md. Curriculum entries already exist.

## Out of scope

- Running real JavaScript, real HTML or a real shell, in any form.
- Attribute, URL and CSS encoding contexts for XSS. Encoding here covers HTML text only, and the lesson says other contexts need their own rule.
- DNS rebinding, time-of-check attacks, HTTP smuggling, clickjacking, and CSP reporting.
- A STRIDE walkthrough.
- The other deferred minors from phase 2, unless a task touches the same lines.
