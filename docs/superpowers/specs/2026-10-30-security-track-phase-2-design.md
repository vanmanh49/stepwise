# Security track, phase 2: identity and access

Date: 2026-10-30
Status: approved design, awaiting spec review

## Goal

Make the 8 **Identity & Access** topics live on a simulated web app that runs in the page. A learner who finishes phase 2 can say why a given login is safe or unsafe, and which control stops which attack. Phase 3 (Web Attacks & Defenses) reuses the same app.

## Decisions

- **A real app with chosen moves** (the user's choice). Route handlers really run, tables live in the SQL interpreter, the browser really enforces cookie rules, and JWTs and PKCE hashes are real. Learners pick the attack and toggle the defense with `choice` fields. They do not edit requests by hand.
- **Every attack lesson shows the attack working, then the defense stopping it.** Each of those lessons has an `attack` field and a `defense` field (`Off`, `On`). Credential Attacks offers three defenses, and Password Storage picks a storage scheme instead.
- **One world for every lesson:** `shop.example` (the app), `login.example` (the identity provider) and `evil.example` (the attacker's site). Scenarios are fixed: users, passwords and wordlists are data, not learner input, apart from one password field.
- **Everything runs against simulated parties in the page.** There is no network, and nothing here can be pointed at a real site.
- **Small work, stated honestly.** Our HMAC takes about 21 µs on a laptop, so 600,000 PBKDF2 rounds would take about 13 s there and longer on a phone. Lessons run 100 real rounds and scale the reported cost, and the text says so.
- **No new view kind and no new input kind.**
- One spec, one plan, one PR on branch `security-phase-2`, inside the `stepwise` folder (no worktree). Ask before merging.

## 1. New crypto (`src/security/crypto/`)

Pure functions on `Uint8Array`, with the same teaching-code comment and the same rules as phase 1.

- `base64url.ts`: `encode(bytes)`, `decode(text)` (returns `null` on bad input), no padding.
- `pbkdf2.ts`: `pbkdf2(password, salt, rounds, length)` with HMAC-SHA-256.
- `totp.ts`: `totp(secret, unixSeconds, digits = 6)` with HMAC-SHA-256 and a 30 s step (RFC 6238), plus `hotpOffset` exposed for the lesson's steps.
- `jwt.ts`: `signHs256(header, payload, key)`, and `splitToken(token)`, which returns the decoded parts or `null`. There is deliberately no all-in-one `verify`: the sites choose what to check, and that choice is what the lessons teach. A toy `TOY-RS` signature (phase 1's small RSA key) signs ID tokens, because OpenID Connect needs one provider key shared by many apps. It is labelled as a toy.

## 2. The web app (`src/security/web/`)

No React. Entry points never throw. Nothing reads the clock or `Math.random`: time is a simulated counter in seconds, and ids come from `seeded`, so runs repeat exactly.

- `http.ts`: the types.
  - `WebRequest`: `method` (`GET`, `POST`), `url`, `headers`, `body`.
  - `WebResponse`: `status`, `headers`, `setCookies`, `body`, `redirect`.
  - `SetCookie`: `name`, `value`, `domain`, `path`, `secure`, `httpOnly`, `sameSite`, `maxAge`.
- `browser.ts`: a browser with a cookie jar.
  - Cookies are host-only unless `domain` is set, and `Secure` cookies are sent only over https.
  - `HttpOnly` hides a cookie from page scripts. `maxAge` expires it on the simulated clock.
  - `SameSite` is applied by comparing the request's site with the page that started it. A cookie with no `SameSite` attribute counts as `Lax`, as in current browsers.
  - `visit`, `submit` and `runScript` are the only ways in. `runScript(origin)` returns what a script on that origin may read, and phase 3 builds XSS on it.
- `site.ts`: `Site` is an origin, a route table and an optional database. A handler takes the request and the world and returns a response.
- `world.ts`: `createWorld(config)` holds the clock, browser, sites and eavesdropper.
  - `send(request, from)` delivers a request and records an event for it and for its response.
  - An eavesdropper sees `http:` traffic in full, and for `https:` sees only the host.
  - Requests to an unknown host give a recorded network error.
- `db.ts`: the shop's database, a `Dataset` run through `runScript`.
  - Tables: `users` (id, name, role, hash, salt), `sessions`, `orders` (id, owner, item, total).
  - `sql(strings, ...values)` builds statements with values quoted, because the interpreter has no bound parameters.
  - The dataset uses the id `shop`: it is never registered, so the id is only a label.
- `shop.ts`: `createShop(options)` with routes for sign in, sign out, the account page, orders and an admin page. `options` holds the storage scheme, session settings, token settings and access-control checks. One lesson changes one option.
- `login.ts`: `createLogin(options)`, the identity provider, with sign-in, `/authorize`, `/token` and `/jwks`. Options cover PKCE, `state` and redirect matching.
- `evil.ts`: pages the attacker controls: a phishing page that relays to the real site, a page that receives stolen codes, and a registered app for the OpenID Connect lesson.
- `steps.ts`: `worldSteps(events, narration)` turns recorded events into `Step`s, capped at `MAX_STEPS = 200`. A run with many attempts shows its first few and one summary step.

### Views

Each step is a `panels` view:

- a `services` view: `Browser` (`client`), the sites (`service`), `Attacker` (`attacker`) and the shop's `db`, with the request on its link;
- a `grid` of the browser's cookies, with each flag shown;
- a `grid` of the rows this step reads or writes.

The attacker node is left out of steps with no attacker. If the `services` panel is unreadable at 375 px with five nodes, the fallback is to draw only the parties in this step, still with no new view kind.

### Reuse

`partiesView`, `byteGrid`, `readBytes`, `EMPTY` and `MAX_STEPS` from `src/security/steps.ts`. `web/steps.ts` adds to them rather than repeating them.

## 3. Lessons

Each lesson is a `form` visualization with `codeLabel: 'Pseudocode'`, 4 quiz questions of at least 3 types, one `predict-next` from a real step, and a last `concept` paragraph on real practice that contains the word "production".

| Lesson (id) | Fields | What the learner watches |
|---|---|---|
| Password Storage (`password-storage`) | `storage` (Plain text, SHA-256, Salted SHA-256, PBKDF2), `password` (1–32 bytes) | The database leaks. The attacker tries a 12-word list against 3 users and the learner's account. Plain text is read directly, equal hashes show which users share a password, salts force one search per user, and PBKDF2 multiplies each guess. Each run reports guesses tried and the time at real speed. A strong password survives every scheme except plain text |
| Credential Attacks (`credential-attacks`) | `attack` (Guessing, Credential stuffing, Password spraying), `defense` (None, Per-IP limit, Account lockout) | Attempts arrive on the simulated clock, then a summary. Guessing hits a lockout. Stuffing from many addresses gets past a per-IP limit. Spraying stays under a per-account lockout. Guessing against lockout also shows the real user locked out |
| Sessions & Cookies (`sessions-cookies`) | `attack` (Script reads the cookie, Sniffed on http, Session fixation, Guessable id, Stolen after sign-out), `defense` | The session row, the cookie and the flags. The defenses are `HttpOnly`, `Secure`, a new id at sign-in, random ids, and deleting the row at sign-out |
| JSON Web Tokens (`json-web-tokens`) | `attack` (Edit the payload, `alg: none`, Weak secret, Stolen token), `defense` | The three parts decoded. The defenses are verifying the signature, a fixed algorithm, a strong secret, and a short expiry. Stolen token compares a JWT, which stays valid until it expires, with a session, which can be deleted |
| Multi-Factor Auth (`multi-factor-auth`) | `attack` (Stolen password, Reused code, Live phishing relay), `defense` | A real TOTP code worked out from the secret and clock, valid for one step either side. The defenses are requiring TOTP, one-time codes, and a simulated passkey that signs the real origin, so a relay through `evil.example` fails |
| OAuth 2.0 & PKCE (`oauth-pkce`) | `attack` (Stolen code, Login CSRF, Redirect tampering), `defense` | The authorization code flow across browser, shop and `login.example`. The defenses are PKCE with a real S256 challenge, `state`, and exact redirect matching |
| OpenID Connect (`openid-connect`) | `attack` (Token for another app, Replayed token, Expired token, Access token as login), `defense` | The ID token's claims, checked one by one. The defenses are checking `aud`, `nonce` and `exp`, and accepting only an ID token as proof of sign-in. `iss` and the signature are always checked and shown |
| Access Control (`access-control`) | `attack` (Someone else's order, Admin page by URL, Change my role), `defense` | The shop's SQL rows and the failing or passing check. The defenses are an ownership check, a role check on the server rather than a hidden button, and an allow-list of editable fields. Access is denied by default |

Attacks and defenses pair up one to one: in each lesson, `defense` turns on the control for the chosen attack. Each scenario module exports its pseudocode, its options and `<id>Steps(values)`.

Prerequisites: `password-storage` needs `hash-functions`. `credential-attacks` needs `password-storage`. `sessions-cookies` needs `certificates-tls`. `json-web-tokens` needs `message-authentication` and `sessions-cookies`. `multi-factor-auth` needs `message-authentication` and `credential-attacks`. `oauth-pkce` needs `sessions-cookies` and `hash-functions`. `openid-connect` needs `oauth-pkce`, `json-web-tokens` and `public-key-signatures`. `access-control` needs `sessions-cookies`.

### Invalid input

Bad knobs return one explanatory step through `refusal`, as in phase 1:

- `password` empty or over 32 bytes;
- any `choice` value outside its options.

## 4. Testing

- Published vectors, confirmed against Node before writing this spec:
  - RFC 6238 with HMAC-SHA-256, 8 digits, 32-byte key `12345678901234567890123456789012`: T = 59 gives `46119246`, T = 1111111109 gives `68084774`.
  - RFC 7515 appendix A.1: the HS256 signature is `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`.
  - RFC 7636 appendix B: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` gives challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.
- Differential tests against `node:crypto` and `Buffer`: `pbkdf2Sync` and base64url on seeded inputs, including empty input and bad base64url.
- `browser.ts`: a table of cookie cases covering `Secure` on http, `HttpOnly` from a script, each `SameSite` value on same-site and cross-site requests, a missing `SameSite`, host-only against domain cookies, and expiry on the simulated clock.
- `world.ts`: an eavesdropper sees http content but only the host of https; an unknown host gives a network error; two runs are deep-equal.
- One test per lesson attack: the attack succeeds with `defense` off and is stopped with it on, and the last step says so. Credential Attacks is tested for every attack and defense pair, including the real user locked out.
- `src/security/contract.test.ts` already covers every Security lesson, and gains a check that each `services` view's messages use drawn nodes and that each view's ids are unique.
- `npm run check:bundle` stays under 600 kB. The web app loads with the lesson chunks.
- By hand in a browser: every lesson at 375 px and 1024 px, in both themes. The password lesson must not freeze a phone-class CPU, so check it at 4× CPU throttling.

## Touch points

`src/security/crypto/**`, `src/security/web/**`, `src/security/scenarios/*`, `src/lessons/security/*`, `src/lessons/meta/security.ts`, `src/lessons/lessons.test.ts`, `scripts/static-pages.test.ts` (lesson count), `src/security/contract.test.ts`, README.md and CLAUDE.md. Curriculum entries already exist.

## Out of scope

- Phase 3: same-origin rules, CORS, CSP, XSS, CSRF, SSRF and SQL injection. The browser and database are built so these can be added, but nothing for them is built now.
- Editing requests by hand.
- Argon2, scrypt and bcrypt (named in lesson text only).
- The real WebAuthn format, refresh token rotation, device flow and SAML.
- The minors deferred from phase 1 (listed in PR #34).
