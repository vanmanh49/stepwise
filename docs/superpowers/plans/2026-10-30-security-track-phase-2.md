# Security Track, Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 8 Identity & Access lessons live on a simulated web app in the page, with real cookie rules, tokens and hashes, reusable by phase 3.

**Architecture:** New crypto modules in `src/security/crypto/`, then `src/security/web/` (no React): `http` types → `browser` → `site` and `db` → `world` → `shop`, `login`, `evil` → `story` (world to `Step[]`). Each lesson's scenario builds a world with one option changed, plays the moves and returns steps through a `story`. No new view kind or input kind.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Oxlint. Node 24 (`node:crypto` in tests only).

**Spec:** `docs/superpowers/specs/2026-10-30-security-track-phase-2-design.md`

## Global Constraints

- Branch `security-phase-2` (the spec is committed). No worktrees.
- `src/security/` contains no React; all lesson text lives in `src/lessons/`.
- Deterministic: nothing reads the clock or `Math.random`. Entry points never throw. Bad knobs give one step through `refusal(title, why, EMPTY)`.
- `node:crypto` is imported only in test files. New crypto files start with `// Teaching code: never use this for real data. Use your platform's crypto library.`
- `MAX_STEPS = 200` per run. Code lines via `lineOf`. Hex is lowercase.
- Byte grids stay at 6 columns. Views must fit a 341 px stage.
- Lessons: no `complexity`, `codeLabel: 'Pseudocode'`, 4 quiz questions of at least 3 types, at least one `predict-next` whose view comes from a real step and does not reveal the answer. Copy is plain, short sentences with actual values, and uses no pronouns for Alice, Bob, Carol, Eve or Mallory.
- The last paragraph of each lesson's `concept` says what production systems use instead and contains the word "production".
- Lessons register in curriculum order. Each lesson task appends its meta (difficulty `intermediate`, group `Identity & Access`), appends its id to `EXPECTED_IDS` in `lessons.test.ts`, and bumps the lesson count in `scripts/static-pages.test.ts`.
- Every step's text must be true for every reachable setting, not just the defaults.
- Commit messages, PR titles and PR bodies contain no AI attribution.
- Every task ends green on `npm run typecheck`, `npm run lint` and `npm test`, read from their exit codes, before its commit.

## Rulings (where this plan narrows the spec)

- **`story.ts` replaces `worldSteps(events, narration)`.** A step's view must be a full snapshot, so scenarios call `story.step(...)` after each move instead of narrating a finished list.
- **`state` lives on the shop**, the OAuth client that checks it (`checkState`), not in `createLogin`. `createLogin` has `pkce` and `exactRedirect`.
- **Safe by default.** `SAFE_SHOP` and `SAFE_LOGIN` have every control on; a lesson's `defense: Off` turns one off. `credential-attacks` picks `limit`; `password-storage` picks `storage`.
- **`/userinfo` on `login.example`** is added for the Access token as login attack.
- **`*.evil.example` resolves to the evil site**, so a prefix-matched redirect (`https://shop.example.evil.example/cb`) reaches the attacker.
- **Passkeys:** the browser holds one toy RSA key scoped to `shop.example`. `browser.passkeySign(origin, challenge)` returns `null` for any other origin, as a real authenticator does.
- **Every attack has a `result` on its last step:** `variables.result` is `'attacker in'` or `'stopped'`.
- **Password Storage reports a rough real rate:** about 10 billion SHA-256 guesses a second on one GPU, and about 8,000 at 600,000 PBKDF2 rounds. The text says "roughly".

## Review Focus

- **A learner's password that matches the wordlist or a shop user** (`sunshine`): the plain and SHA-256 runs must show the learner sharing a row value with `alice` and `bob`, and salted must not. Pinned in Task 8.
- **A password with multi-byte letters at the limit:** 16 × `é` (32 bytes) runs, 17 × `é` refuses. Pinned in Task 8.
- **TOTP at a step boundary:** a code from the previous 30 s step is accepted, and one from two steps ago is refused. Pinned in Task 5.
- **Token expiry at the exact second:** `now === exp` is refused. Pinned in Task 5.
- **Sign-out clearing the browser while an attacker keeps a copy:** the victim's jar is empty, and the attacker's copy still works only with `revokeOnSignOut` off. Pinned in Task 10.

## File map

| File | Responsibility |
|---|---|
| `src/security/crypto/base64url.ts`, `pbkdf2.ts`, `totp.ts`, `jwt.ts` | New primitives |
| `src/security/web/http.ts`, `browser.ts` | Message types; the cookie jar and its rules |
| `src/security/web/site.ts`, `db.ts`, `world.ts` | Routing; SQL tables; clock, delivery and eavesdropper |
| `src/security/web/data.ts` | Users, passwords, `WORDLIST`, leaked pairs, fixed secrets |
| `src/security/web/shop.ts`, `shop-oauth.ts` | The shop's routes; its OAuth and OpenID Connect client routes |
| `src/security/web/login.ts`, `evil.ts` | The identity provider; the attacker's site |
| `src/security/web/story.ts` | Turns a played world into `Step[]` |
| `src/security/scenarios/<id>.ts`, `src/lessons/security/<id>.ts` | Each lesson |

---

### Task 1: base64url and PBKDF2

**Files:** Create `src/security/crypto/base64url.ts`, `pbkdf2.ts`, `pbkdf2.test.ts`. Modify `src/security/crypto/differential.test.ts`.

**Interfaces:**
- Produces: `encodeBase64url(bytes: Uint8Array): string`; `decodeBase64url(text: string): Uint8Array | null`; `pbkdf2(password: Uint8Array, salt: Uint8Array, rounds: number, length: number): Uint8Array`.

- [ ] **Step 1: Write the failing tests.**
  - `pbkdf2(utf8('password'), utf8('salt'), 1, 32)` hex is `120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b`.
  - Differential: `pbkdf2Sync` for rounds 1, 2, 100 and lengths 16, 32, 64; `Buffer.toString('base64url')` on seeded bytes of length 0–40.
  - `decodeBase64url` undoes `encodeBase64url`. It returns `null` for `a!b`, for `a` (impossible length), and for `ab=`. `decodeBase64url('')` is empty.
- [ ] **Step 2: Run them.** `npx vitest run src/security/crypto`. Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** per RFC 8018 and RFC 4648 §5, on `hmac` and the alphabet by hand, without `Buffer`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: base64url and PBKDF2`

### Task 2: TOTP and JWT

**Files:** Create `src/security/crypto/totp.ts`, `totp.test.ts`, `jwt.ts`, `jwt.test.ts`.

**Interfaces:**
- Consumes: `hmac`, `sign`, `verify`, `keyPair`, `RsaKey`, `encodeBase64url`, `decodeBase64url`, `utf8`.
- Produces: `totpCounter(unixSeconds: number): number` (seconds ÷ 30, floored); `hotpOffset(digest: Uint8Array): number`; `totp(secret: Uint8Array, unixSeconds: number, digits = 6): string`.
- Produces: `type TokenParts = { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string; signedPart: string }`; `signHs256(payload: Record<string, unknown>, key: Uint8Array, header?: Record<string, unknown>): string`; `hs256Signature(signedPart: string, key: Uint8Array): string`; `signToyRs(payload, key: RsaKey): string` (header `{ alg: 'TOY-RS', typ: 'JWT' }`, signature decimal text in base64url); `verifyToyRs(token: string, key: { n: number; e: number }): boolean`; `splitToken(token: string): TokenParts | null`; `unsignedToken(payload): string` (header `{ alg: 'none', typ: 'JWT' }`, empty signature).

- [ ] **Step 1: Write the failing tests.**
  - `totp(utf8('12345678901234567890123456789012'), 59, 8)` is `46119246`, and at `1111111109` is `68084774`.
  - A 6-digit code keeps its leading zeros (scan seconds for one starting with `0`).
  - `hs256Signature` of the RFC 7515 A.1 signed part with its base64url key is `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`.
  - `splitToken` of a signed token returns its payload. It returns `null` for `a.b` (2 parts), for bad base64url, and for a part that is not a JSON object.
  - `verifyToyRs` accepts `signToyRs` output and refuses it after one payload character changes.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** JSON is `JSON.stringify` in insertion order. `splitToken` catches JSON errors and returns `null`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: TOTP and JWT`

### Task 3: The browser

**Files:** Create `src/security/web/http.ts`, `browser.ts`, `browser.test.ts`.

**Interfaces:**
- Produces, in `http.ts`: `WebRequest = { method: 'GET' | 'POST'; url: string; headers: Record<string, string>; body: Record<string, string> }`; `WebResponse = { status: number; headers: Record<string, string>; setCookies: SetCookie[]; body: string; redirect?: string }`; `SetCookie = { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: 'Strict' | 'Lax' | 'None'; maxAge?: number }`; `hostOf(url)`, `originOf(url)`, `siteOf(host)` (last two labels), `pathOf(url)`, `queryOf(url): Record<string, string>`, `response(status, body?, extra?)`.
- Produces, in `browser.ts`: `StoredCookie = SetCookie & { host: string; expires?: number }`; `Network = { send(request: WebRequest, from: Party, initiator?: string): WebResponse; now(): number }`; `Browser` with `jar(): StoredCookie[]`, `visit(url, initiator?): WebResponse` (follows up to 5 redirects), `submit(url, body, initiator?): WebResponse`, `runScript(origin): Record<string, string>`, `cookiesFor(url, initiator?, method?): Record<string, string>`, `plant(url, cookie: SetCookie): void`, `passkeySign(origin, challenge): number | null`, `registerPasskey(origin, key: RsaKey): void`. `createBrowser(network: Network): Browser`. `Party = 'browser' | 'attacker' | 'evil' | 'shop' | 'login'`.

- [ ] **Step 1: Write the failing tests, as one table** of `(cookie, request url, initiator, method) → sent or not`:
  - `Secure` not sent over `http:`, sent over `https:`.
  - Host-only cookie not sent to a subdomain; `domain` cookie is.
  - `Strict` not sent cross-site, even on a top-level GET. `Lax` sent cross-site on a GET only. `None` with `secure` sent cross-site. No attribute behaves as `Lax`. No initiator counts as same-site.
  - `SameSite=None` without `secure` is rejected when set.
  - Expired after `maxAge` seconds; exact `maxAge` second is expired. `maxAge: 0` deletes.
  - A same-name, same-host cookie replaces the old one.
  - `runScript` hides `httpOnly` cookies and other hosts' cookies.
  - `passkeySign` returns a number on the registered origin, `null` elsewhere.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `visit` stores `setCookies` from every hop, and stops after 5 redirects with the last response.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: a browser that enforces cookie rules`

### Task 4: Sites, database and world

**Files:** Create `src/security/web/data.ts`, `site.ts`, `db.ts`, `world.ts`, `world.test.ts`, `db.test.ts`.

**Interfaces:**
- Consumes: `Browser`, `createBrowser`, `Network`, `Party`, `http.ts`, `runScript`, `Dataset`.
- Produces, in `data.ts`: `START_TIME = 1_700_000_000`; `WORDLIST` (12: `123456`, `password`, `qwerty`, `letmein`, `dragon`, `sunshine`, `iloveyou`, `admin`, `welcome`, `monkey`, `football`, `secret`); `USERS` = alice (`sunshine`, customer), bob (`sunshine`, customer), carol (`correct-horse-battery`, customer), root (`dragon`, admin); `ORDERS` = 101 (alice, Lamp, 40), 102 (bob, Desk, 250), 103 (carol, Chair, 120); `LEAKED_PAIRS` (6 pairs from another site, one being `alice`/`sunshine`, none for other users here); `TOTP_SECRET` (20 bytes); `TOKEN_SECRET` (32 bytes from `seeded`).
- Produces, in `site.ts`: `Handler = (request: WebRequest, world: World) => WebResponse`; `Route = { method: WebRequest['method']; path: string | RegExp; handler: Handler }`; `Site = { origin: string; party: Party; routes: Route[]; db?: ShopDb }`; `handle(site, request, world): WebResponse` (404 for no route).
- Produces, in `db.ts`: `ShopDb = { rows(table: string): Record<string, string | number | null>[]; run(sql: string): boolean }`; `createDb(users: { name: string; role: string; hash: string; salt: string }[]): ShopDb`; `quote(value: string): string` (doubles `'`); `sql(strings: TemplateStringsArray, ...values: (string | number)[]): string` (quotes strings).
- Produces, in `world.ts`: `WebEvent = { from: Party; to: Party; request: WebRequest; response: WebResponse; at: number }`; `World = { browser: Browser; now(): number; advance(seconds: number): void; send: Network['send']; sites: Site[]; events: WebEvent[]; sniffed(): Sniffed[]; site(party: Party): Site }`; `Sniffed = { host: string; url?: string; cookies?: Record<string, string>; body?: Record<string, string> }`; `createWorld(sites: Site[], seed = 1): World`.

- [ ] **Step 1: Write the failing tests.**
  - `sniffed()` gives full url, cookies and body for `http:`, and only `host` for `https:`.
  - A request to an unknown host records an event with status 0.
  - `https://shop.example.evil.example/cb` reaches the `evil` site.
  - A request from `attacker` sends no browser cookies.
  - `quote("o'brien")` is `'o''brien'`; a `users` row inserted with that name reads back unchanged.
  - `createDb` has tables `users`, `sessions`, `orders`, and `ORDERS` is loaded.
  - Two identical runs give deep-equal `events`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `Dataset.id` is `'shop'`: this dataset is never registered, so the id is only a label. `run` calls `runScript` and keeps its returned `db` when `ok`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: sites, database and a simulated network`

### Task 5: The shop's accounts and sessions

**Files:** Create `src/security/web/shop.ts`, `shop.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–4, `sha256`, `pbkdf2`.
- Produces: `ROUNDS = 100`; `Storage = 'plain' | 'sha256' | 'salted' | 'pbkdf2'`; `hashPassword(password: string, storage: Storage, salt: string): string`.
- Produces: `ShopOptions = { storage: Storage; limit: 'none' | 'ip' | 'lockout'; cookie: { httpOnly: boolean; secure: boolean }; rotateOnSignIn: boolean; randomIds: boolean; revokeOnSignOut: boolean; token: null | { verifySignature: boolean; fixedAlg: boolean; secret: Uint8Array; ttl: number }; mfa: 'none' | 'totp' | 'totp-once' | 'passkey'; access: { ownership: boolean; roleCheck: boolean; allowList: boolean }; checkState: boolean; idToken: { aud: boolean; nonce: boolean; exp: boolean; idTokenOnly: boolean } }`; `SAFE_SHOP: ShopOptions`; `createShop(overrides?: Partial<ShopOptions>): Site`.
- Produces routes: `POST /signin` (`name`, `password`; a `ip` header names the source), `POST /signin/code` (`code`), `GET /signin/challenge`, `POST /signin/passkey` (`signature`), `POST /signout`, `GET /account`, `POST /account`, `GET /orders/:id`, `GET /admin`. Session cookie `sid`; token cookie `token`.
- Constants: lockout after 5 failures; per-IP limit 5 attempts in 60 s; guessable ids count from `1001`; random ids are 16 seeded bytes in hex.

- [ ] **Step 1: Write the failing tests.**
  - Sign-in with `alice`/`sunshine` gives a `sid`, a `sessions` row and 200 on `/account`. A wrong password gives 401 and no cookie.
  - `hashPassword` for `sha256` matches `sha256` hex; two users with one password and `salted` get different hashes; `pbkdf2` uses `ROUNDS`.
  - `rotateOnSignIn` off keeps a planted `sid`; on replaces it.
  - `revokeOnSignOut` on removes the row and the old `sid` gives 401; off leaves it working.
  - `limit: 'lockout'`: the 6th attempt is refused even with the right password. `limit: 'ip'`: the 6th attempt from one address in 60 s gets 429, and works after `advance(60)`.
  - With `token`: an edited payload passes with `verifySignature` off and fails on; `alg: none` passes with `fixedAlg` off and fails on; `now === exp` is refused.
  - `mfa: 'totp'`: a code from the previous step is accepted and one from two steps ago is refused; `totp-once` refuses a code used before.
  - `mfa: 'passkey'`: a signature over the shop's challenge is accepted; a wrong one is refused.
  - `/orders/102` as alice gives 200 with `ownership` off and 403 on. `/admin` as alice gives 200 with `roleCheck` off and 403 on. `POST /account` with `role=admin` changes the role with `allowList` off and not on.
  - A name with `'` signs in without breaking the query.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: the shop's accounts, sessions and checks`

### Task 6: The identity provider and the attacker's site

**Files:** Create `src/security/web/login.ts`, `shop-oauth.ts`, `evil.ts`, `oauth.test.ts`. Modify `src/security/web/shop.ts` (mount the client routes).

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `LoginOptions = { pkce: boolean; exactRedirect: boolean }`; `SAFE_LOGIN`; `createLogin(overrides?): Site`; `PROVIDER_KEY: RsaKey` (primes 691, 809, e 17). `SHOP_CLIENT = { id: 'shop', redirect: 'https://shop.example/callback' }`; `EVIL_CLIENT = { id: 'evil-app', redirect: 'https://evil.example/cb' }`.
- Produces routes on login: `GET /authorize` (`client_id`, `redirect_uri`, `state`, `nonce`, `code_challenge`), `POST /token` (`code`, `client_id`, `code_verifier`) returning JSON with `access_token` and `id_token` (claims `iss`, `sub`, `aud`, `nonce`, `iat`, `exp`, 1 hour), `GET /userinfo` (`authorization` header), `GET /jwks`.
- Produces routes on shop: `GET /signin/provider` (starts the flow, stores `state`, `nonce` and `verifier`), `GET /callback` (`code`, `state`), `POST /signin/id-token` (`id_token`), `POST /signin/access-token` (`access_token`).
- Produces on evil: `createEvil(): Site` with `GET /cb` (records received `code`), `evilInbox(site): string[]`, and a phishing page used by the MFA lesson.
- Constants: `checkState`, `idToken.*` from `ShopOptions`. `iss` is `https://login.example`, and signature and `iss` are always checked. `code_challenge` is base64url of SHA-256 of the verifier.

- [ ] **Step 1: Write the failing tests.**
  - The RFC 7636 appendix B verifier gives its challenge through the same function `/token` uses.
  - A full flow signs alice in on the shop with a real `id_token`.
  - `/token` without the verifier: gives tokens with `pkce` off and 400 with it on. A wrong verifier gives 400. A code works once.
  - `/authorize` with `https://shop.example.evil.example/cb`: redirects there with a code with `exactRedirect` off, and with it on gives 400 and no redirect.
  - `/callback` with a mismatched `state`: signs in with `checkState` off, 400 with it on.
  - An `id_token` with `aud: evil-app`: accepted with `aud` off, 401 on. A reused `nonce`: accepted off, 401 on. Past `exp`: accepted off, 401 on; `now === exp` refused on.
  - `/signin/access-token`: signs in with `idTokenOnly` off, 401 on.
  - A token with a changed payload, or `iss` other than the provider, is refused in every setting.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: an identity provider and the attacker's site`

### Task 7: Stories

**Files:** Create `src/security/web/story.ts`, `story.test.ts`. Modify `src/security/steps.ts` (`DEFENSE_OPTIONS = ['Off', 'On']`).

**Interfaces:**
- Consumes: `World`, `ServicesView`, `byteGrid` conventions.
- Produces: `NodeId = 'browser' | 'attacker' | 'evil' | 'shop' | 'login' | 'db'`; `createStory(input: { world: World; code: string; nodes: NodeId[] }): Story`; `Story = { step(input: { title: string; why: string; next?: string; line: string; variables?: Step['variables']; rows?: GridView }): void; steps: Step[] }`; `cookieGrid(world): GridView`; `rowsGrid(rows: Record<string, unknown>[], prefix: string): GridView`; `resultOf(ok: boolean): 'attacker in' | 'stopped'`.
- Links come from one table filtered by `nodes`: browser–shop, browser–login, browser–evil, attacker–shop, attacker–login, attacker–browser, evil–shop, shop–login, evil–login, shop–db, attacker–db.

- [ ] **Step 1: Write the failing tests.**
  - Each `step` draws the events since the last step as messages, labelled `POST /signin`, with no message outside `nodes`.
  - A step shows the cookie grid, with flags as text, and `rows` when given.
  - Every message in every step lies on a drawn link.
  - Two steps with no events between them draw no messages.
  - `line` is resolved through `lineOf`, so an unknown snippet throws in tests.
  - More than `MAX_STEPS` calls stop at `MAX_STEPS`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Views are `panels` with `{ label: 'On the wire' }`, `{ label: 'Cookies' }` and, when given, `{ label: 'Rows' }`. Grids of long values use text cells, which wrap.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: turn a played world into steps`

### Tasks 8–15: one lesson each

Each task creates `src/security/scenarios/<id>.ts`, `<id>.test.ts` and `src/lessons/security/<id>.ts`, and modifies `src/lessons/meta/security.ts`, `lessons.test.ts` and `scripts/static-pages.test.ts`.

Steps for each:

- [ ] **Step 1: Write the failing scenario test** with the assertions below, using `it.each` over the attacks.
- [ ] **Step 2: Run it.** `npx vitest run src/security/scenarios/<id>.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the scenario:** `<camelId>Code`, the option arrays, `<camelId>Steps(values)`.
- [ ] **Step 4: Write the lesson and meta** per the Global Constraints, with one preset per attack. Each preset starts with the defense off, so the attack is seen working.
- [ ] **Step 5: Run everything.** `npm run typecheck && npm run lint && npm test`. Expected: all exit 0.
- [ ] **Step 6: Commit.** `Security: <lesson title> lesson`

| Task | Lesson (fields) | Scenario test assertions |
|---|---|---|
| 8 | Password Storage (`storage`, `password`) | `Plain text`: every password readable, 0 guesses. `SHA-256`: `alice` and `bob` show equal hashes and fall to one guess of `sunshine`. `Salted SHA-256`: their hashes differ and `sunshine` costs one search per user. `PBKDF2`: same cracks, cost shown as guesses × 100. A password outside `WORDLIST` stays uncracked in every scheme except plain text. Password `sunshine` matches `alice`'s row under plain and SHA-256 and not under salted. 16 × `é` runs, 17 × `é` refuses. Empty refuses. Last step's `variables` has `guesses` and `cracked`. |
| 9 | Credential Attacks (`attack`, `defense`: `None`, `Per-IP limit`, `Account lockout`) | Every pair's `result`: Guessing: None in, Per-IP stopped, Lockout stopped. Credential stuffing: in, in, in. Password spraying: in, in, in. Guessing against lockout: a real sign-in by `alice` with the right password is refused, and the last step says so. Steps stay under 30. The last `why` for stuffing and spraying names MFA and breached-password checks. |
| 10 | Sessions & Cookies (`attack`, `defense`) | Each attack: `result` is `attacker in` with Off, `stopped` with On. `Stolen after sign-out`: the victim's jar is empty in both, and the attacker's copy works only with Off. `Sniffed on http`: `sniffed()` holds the cookie only with Off. `Guessable id`: the attacker reaches `1002` from `1001` with Off. |
| 11 | JSON Web Tokens (`attack`, `defense`) | Each attack: Off in, On stopped. `Edit the payload` reaches `/admin` as `alice`. `Weak secret` finds `secret` in `WORDLIST` with Off and finds nothing with On. `Stolen token` compares both: the token still works after sign-out with Off (a day's expiry), and fails after 600 s with On (300 s), and the `why` says a session row could be deleted at once. The decoded parts appear in `rows`. |
| 12 | Multi-Factor Auth (`attack`, `defense`) | Each attack: Off in, On stopped. `Stolen password` uses `alice`'s password with no MFA and then TOTP. `Reused code` replays a code seen 10 s earlier. `Live phishing relay` with Off relays a live TOTP code through `evil.example`; with On, `passkeySign` returns `null` on `evil.example` and the step says so. A real code and its 30 s window appear. |
| 13 | OAuth 2.0 & PKCE (`attack`, `defense`) | Each attack: Off in, On stopped. `Stolen code`: the attacker redeems it with Off, and gets 400 with On. `Login CSRF`: with Off the victim's browser is signed in as the attacker, and `result` is `attacker in`. `Redirect tampering`: `evilInbox` holds a code with Off and is empty with On. The S256 challenge appears as a real value. |
| 14 | OpenID Connect (`attack`, `defense`) | Each attack: Off in, On stopped, and the step names the claim that failed. `Token for another app` shows `aud: evil-app`. `Expired token` advances past `exp`. `Access token as login` calls `/userinfo` with Off. Claims appear in `rows`, and the `iss` and signature checks always appear as passed. |
| 15 | Access Control (`attack`, `defense`) | Each attack: Off in, On stopped. `Someone else's order`: `alice` reads order 102 with Off, and 403 with On. `Admin page by URL`: the page has no link for `alice`, and with Off the URL still works. `Change my role`: the `users` row in `rows` shows `admin` with Off and `customer` with On. |

**Prerequisites (meta):** as in the spec's Lessons section.

**Contract:** Task 8 adds `password-storage` with no `RANGES`. `src/security/contract.test.ts` gains: messages lie on drawn links (use the Task 7 rule) for every Security lesson.

**Task 8 speed check:** the attacker stops at a user's first match, so `variables.guesses` is at most 60 (12 words × 5 accounts). With `ROUNDS = 100`, that is at most 6,000 HMAC calls, about 130 ms on a laptop. Test the 60.

**Task 13 browser check:** open the OAuth lesson at 375 px, with `shop`, `login`, `evil`, `attacker` and `db` nodes. If the panel is unreadable, narrow `nodes` to the parties in each step, keeping `Story`'s signature, before moving on.

### Task 16: Docs and final checks

**Files:** Modify `README.md`, `CLAUDE.md`.

- [ ] **Step 1: Update the docs.** `CLAUDE.md`: extend the Security entry with `crypto/` additions and `web/` (browser, world, shop, login, evil, story). `README.md`: lesson count 170, Security (15 of 23 live) with the 8 titles, project layout, and "How to add a Security lesson" for web lessons.
- [ ] **Step 2: Run CI's checks.** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all exit 0, first load under 600 kB.
- [ ] **Step 3: Check by hand.** `npm run dev`, then at 375 px and 1024 px, in both themes: all 8 lessons open with no sideways scroll in the stage, and each preset runs. Run Password Storage with PBKDF2 at 4× CPU throttling: Run responds without a visible freeze.
- [ ] **Step 4: Commit.** `Docs: Security track phase 2`
