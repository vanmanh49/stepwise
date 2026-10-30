# Security track, phase 1: cryptography

Date: 2026-10-30
Status: approved design, awaiting spec review

## Goal

Add a seventh category, **Security**, that takes learners from cryptography, through identity and access, to web attacks and their defenses. Phase 1 builds a teaching crypto engine and makes the 7 **Cryptography** topics live. The other 16 topics show as Coming soon.

A learner who finishes phase 1 can say what each primitive guarantees, what breaks when it is misused, and how the pieces combine in a TLS connection.

## Decisions

- **One category** (the user's choice), in three phases: Cryptography (beginner), Identity & Access (intermediate), Web Attacks & Defenses (advanced). Each phase has its own spec, plan and PR.
- **Hybrid crypto** (the user's choice). SHA-256, HMAC, HKDF and AES-128 (with CBC, CTR and GCM) are real and checked against Node's `crypto`. RSA and Diffie-Hellman use the real math with small numbers, labelled as insecure sizes, so every number can be followed.
- **A simulated web app for phases 2 and 3** (the user's choice, option A): browser, server and database exchange HTTP-like messages, cookies, same-origin rules and CSP are enforced, and the SQL interpreter runs the queries. Phase 1 does not build it. Those phases reuse `src/security/crypto/` for password hashing, JWTs and TOTP.
- **Understand the mechanism, not a library.** Lesson code is short pseudocode. No network calls, and everything runs in the page against simulated parties.
- **Every lesson says it is teaching code.** The last paragraph of each lesson's `concept` names what production systems use instead.
- **The existing `form` input** drives every lesson (knobs = fields, scenarios = presets). There is no new input kind.
- **No new view kind.** Phase 1 reuses `array`, `grid` (with `heat`), `services` and `panels`. `services` gains one node type, `attacker`.
- One spec, one plan, one PR on branch `security-phase-1`, inside the `stepwise` folder (no worktree). Ask before merging.

## Curriculum

All 23 topics go into `curriculum.ts` under category `security` (title "Security"), with a group per difficulty:

| Difficulty | Group | Topics (id: title) |
|---|---|---|
| beginner | Cryptography | `hash-functions`: Hash Functions · `message-authentication`: Message Authentication · `symmetric-encryption`: Symmetric Encryption · `block-modes`: Block Modes & AEAD · `key-exchange`: Key Exchange · `public-key-signatures`: Public Keys & Signatures · `certificates-tls`: Certificates & TLS |
| intermediate | Identity & Access | `password-storage`: Password Storage · `credential-attacks`: Credential Attacks · `sessions-cookies`: Sessions & Cookies · `json-web-tokens`: JSON Web Tokens · `multi-factor-auth`: Multi-Factor Auth · `oauth-pkce`: OAuth 2.0 & PKCE · `openid-connect`: OpenID Connect · `access-control`: Access Control |
| advanced | Web Attacks & Defenses | `same-origin-cors`: Same-Origin & CORS · `sql-injection`: SQL Injection · `command-injection`: Command Injection & Path Traversal · `cross-site-scripting`: Cross-Site Scripting · `content-security-policy`: Content Security Policy · `csrf`: CSRF · `ssrf`: SSRF · `threat-modeling`: Threat Modeling & Defense in Depth |

None of these ids is used by another category. Only the 7 Cryptography topics are registered in phase 1. Prompt injection stays in the AI track.

## 1. Engine (`src/security/`)

No React, the same layering as `src/ai/`. Crypto functions are pure and work on `Uint8Array`. Entry points never throw. Nothing reads the clock or `Math.random`: keys, IVs and nonces are fixed values or come from `seeded`, so runs repeat exactly. A comment at the top of `src/security/crypto/` code says it is teaching code and not for real use.

### Primitives (`crypto/`)

- `bytes.ts`: UTF-8 through `TextEncoder`, hex, XOR, concat.
- `sha256.ts`: `sha256(bytes)`, plus `traceBlock(block, state)`, which returns the message schedule and the registers after each of the 64 rounds. `resume(state, bytesSoFar, extra)` continues from a known digest, for the length-extension attack.
- `hmac.ts`: `hmac(key, message)`, `hkdfExtract`, `hkdfExpand`.
- `aes.ts`: AES-128 key expansion and block encryption, with `traceBlock` returning the state after every SubBytes, ShiftRows, MixColumns and AddRoundKey. There is no block decryption: CTR and GCM decrypt with the block encrypt, and CBC is only shown encrypting.
- `modes.ts`: `ecb`, `cbc`, `ctr`, `gcmEncrypt`, `gcmDecrypt` (returns `null` on a bad tag). GHASH runs on BigInt, because speed does not matter here.
- `numbers.ts`: `modPow`, `gcd`, `modInverse` (extended Euclid), `isPrime` (trial division). Plain `number`s: moduli stay below 2^20 for RSA and at 65537 for Diffie-Hellman, so products stay below 2^53.
- `rsa.ts`: `keyPair(p, q, e)`, `encrypt`, `decrypt`, `sign`, `verify`. Signing takes SHA-256 of the message modulo n.
- `tls.ts`: runs the handshake below and returns a list of events, as `simulate` does in the other tracks.

### Handshake (`tls.ts`)

A shortened TLS 1.3:

1. **ClientHello** with a Diffie-Hellman share.
2. **ServerHello** with its share. Both sides derive the keys through HKDF.
3. **Certificate** chain (leaf → intermediate → root) and **CertificateVerify** (a signature over the hash of the messages so far).
4. The client checks the chain against its one-entry trust store, the name, and the dates against a fixed scenario date.
5. **Finished** in both directions: an HMAC over the transcript hash.
6. One application record, encrypted with AES-128-GCM.

Key derivation is one HKDF step instead of the real schedule's many labels, and certificates are plain objects instead of X.509. The lesson says so.

### Steps and scenarios (`steps.ts`, `scenarios/<id>.ts`)

- Each scenario module exports its pseudocode, its knob options and `<id>Steps(values)`, as the AI scenarios do. `steps.ts` holds shared view builders: a byte grid, a 4×4 AES state grid, a digest grid, and the parties view.
- Step `title`s state what happened with real values, `why` explains it, and `next` says what comes next. `codeLine` points into the pseudocode through `lineOf`.
- Runs stay within `MAX_STEPS = 200`. The longest is about 70 steps (SHA-256).

### Invalid input

Bad knobs return one explanatory step through `refusal` (`src/algorithms/form.ts`), and nothing runs:

- SHA-256 text over 55 UTF-8 bytes, because the walkthrough shows one block.
- AES text over 16 bytes, or a key that is not 1–16 bytes. Shorter values are padded with zero bytes, and the step says so.
- HMAC key over 16 bytes, message over 32 bytes, or extension over 16 bytes.
- Block-mode messages over 32 bytes.
- RSA `p` or `q` not prime or outside 11–997, `p = q`, `e` outside 3–65537 or not coprime with φ(n), or a number to encrypt outside 0 to n − 1.
- Diffie-Hellman secrets outside 2 to p − 2.

## 2. Views

- **Bytes and digests**: `grid` rows of 8 cells, which fit a 375 px screen. Bytes that changed use the `compare` role.
- **AES**: `panels` with the state and the round key as 4×4 `grid`s.
- **SHA-256**: `panels` with registers a–h (a text `grid`) and the current W and K.
- **ECB image**: an 8×8 `grid` with `heat` taken from each ciphertext block's first byte, beside the plain image.
- **Parties**: `panels` with a `services` view (client, attacker, server, with messages on the links) and a `grid` of what each party knows. A step drawing no attacker leaves the attacker node out.

### `services` changes

`ServicesView` node `type` gains `'attacker'`, with a matching `TYPE_NAME` entry. The view's `aria-label` drops its "0 requests" part when `requests` is empty. `requests` stays empty in this track, so the request table is hidden and only the event log shows, which the renderer already handles.

If `ServicesRenderer` turns out unreadable inside `panels` at 375 px, the fallback is a text `grid` ladder (one row per message, columns client, wire, server), still with no new view kind.

## 3. Lessons

| Lesson | Knobs (fields; presets) | What the learner watches |
|---|---|---|
| Hash Functions | mode (inside one hash, compare two inputs), text, second text; presets: `abc`, one letter changed, empty text | Padding, message schedule and 64 rounds of the registers, ending in a digest that matches `sha256sum`. Compare mode shows both digests, the bytes that differ and the bits changed out of 256 |
| Message Authentication | scheme (`SHA-256(key + message)`, HMAC), key, message, extension; presets: forgery on the naive scheme, the same forgery on HMAC | The server tags a message. The attacker, without the key, resumes from the tag and appends the extension. The naive scheme accepts the forgery; HMAC's inner and outer hashes reject it |
| Symmetric Encryption | text, key; presets: short text, full 16 bytes, one key byte changed | Key expansion, then every operation of all 10 rounds on the 4×4 state, with output matching a real AES-128 block |
| Block Modes & AEAD | scenario (patterns, nonce reuse, tampering), mode (ECB, CBC, CTR, GCM), shape, message; presets: one per scenario | ECB leaks the image and the other modes hide it. Reusing a CTR nonce makes c₁ ⊕ c₂ = p₁ ⊕ p₂, which reveals the second message. A flipped CTR bit changes `$100` to `$900` undetected, while GCM's tag refuses it |
| Key Exchange | prime (23, 227, 65537), secret a, secret b, attacker (none, eavesdropper, man in the middle); presets: one per attacker | Public shares and the same shared secret on both sides. The eavesdropper searches for a secret, and the step reports how many tries a small prime took. The man in the middle ends up with a separate secret on each side and nobody notices, which sets up signatures |
| Public Keys & Signatures | operation (encrypt, sign), p, q, e, number, message, tamper; presets: 61 × 53, tampered message, same number twice | n, φ(n) and d worked out by extended Euclid. Encrypt shows mᵉ mod n and back, and that the same number always gives the same ciphertext, which is why real RSA uses padding. Sign and verify show a tampered message failing |
| Certificates & TLS | attack (none, self-signed certificate, expired certificate, wrong name, tampered record); presets: one per attack | Each handshake message on the parties view. The chain check step by step, then Finished and an encrypted record. Each attack fails at a named check and the connection closes |

Each lesson has the usual content: overview, concept, how it works, pros and cons, applications, common mistakes, and a 4-question quiz with at least one `predict-next` question built from a real step. The last paragraph of `concept` covers real practice: SHA-256 and HMAC from a platform library, AES-256-GCM or ChaCha20-Poly1305, X25519 and hybrid post-quantum key exchange, RSA at 2048 bits or more with OAEP or PSS, Ed25519, and never writing your own crypto. It uses the word "production".

Prerequisites run in lesson order, with Message Authentication and Public Keys & Signatures both needing Hash Functions, Block Modes needing Symmetric Encryption, and Certificates & TLS needing Key Exchange, Public Keys & Signatures and Block Modes.

## 4. Site changes

- `Category` gains `'security'`. `CATEGORY_TITLE` and `CATEGORY_INTRO`, `CATEGORY_ICON` (`Shield`, in `SearchPalette.tsx`) and `CODE_COPY` (`LessonPage.tsx`) get entries. Routes, progress bars and static pages follow from `CATEGORIES`.
- **Header**: a ninth link overflows the 1024 px header by 14 px (measured). The desktop nav links change from `px-3` to `px-2.5 xl:px-3`, which saves 36 px at `lg`.

## 5. Testing

Vitest, the same pattern as the other tracks:

- **Differential tests** (`crypto/differential.test.ts`), like the SQL ones: seeded random inputs through our code and Node's `crypto` must agree for SHA-256, HMAC, HKDF, AES-128-ECB, CBC, CTR and GCM (ciphertext and tag). `node:crypto` is imported only in tests and never bundled.
- Published vectors: SHA-256 `abc` and the empty string, the FIPS-197 AES example, and an RFC 4231 HMAC case.
- `sha256`: `resume` from a digest equals hashing the padded message plus the extra bytes.
- `modes`: `gcmDecrypt` returns `null` after any flipped ciphertext or tag bit.
- `numbers`, `rsa`: `modInverse` satisfies a·a⁻¹ ≡ 1; decrypt undoes encrypt for every m below a small n; a tampered message fails to verify; g is a generator for each of the three primes.
- `tls`: the clean run reaches the application record; each attack stops at its named check; client and server derive equal keys.
- `src/security/contract.test.ts`, as in the other tracks: every Security lesson runs with random and garbage settings; runs stay within 200 steps, code lines are valid, runs repeat exactly, and bad knobs give exactly one refusal step.
- Curriculum tests: `security` has 23 topics in the order above with three groups, the 7 Cryptography lessons are live, and each one's `concept` mentions "production".
- Views have no DOM tests in this repo: the parties view, the ECB image and the header are checked by hand in a browser, at 375 px and 1024 px, in both themes.
- `npm run check:bundle` stays under 600 kB (402.1 kB before this work). Crypto code loads with the lesson chunks.

## Touch points

`src/types/lesson.ts`, `src/types/visualization.ts` (`attacker`), `ServicesRenderer.tsx`, `Header.tsx`, `SearchPalette.tsx`, `LessonPage.tsx`, `src/lessons/curriculum.ts`, `labels.ts`, `lessonList.ts`, `src/lessons/meta/security.ts`, the glob lists in `registry.ts`, `all.testutil.ts` and `split.test.ts`, `src/lessons/lessons.test.ts`, `src/lessons/security/*.ts`, `src/security/**`, and README.md and CLAUDE.md (the track list and a `src/security/` architecture entry).

## Out of scope

- Phases 2 and 3 and the simulated web app (their own specs).
- AES decryption, AES-192/256, ChaCha20, elliptic curves and post-quantum algorithms (named in lesson text only).
- Padding oracles and timing attacks.
- A birthday-attack demo in Hash Functions.
- X.509 parsing, certificate revocation, and TLS session resumption.
- Multi-block SHA-256 walkthroughs (longer inputs are still hashed correctly by the engine).
