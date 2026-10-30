# Security Track, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Security category (23 topics) and make its 7 Cryptography lessons live, on a teaching crypto engine tested against Node's `crypto`.

**Architecture:** New engine folder `src/security/` (no React): `crypto/` holds pure primitives on `Uint8Array` (`bytes` → `sha256` → `hmac`; `aes` → `modes`; `numbers` → `rsa`; all → `tls`). `steps.ts` holds shared view builders, and `scenarios/<id>.ts` turns each run into `Step[]` for a `form` lesson. No new view kind: `services` gains an `attacker` node type.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), React 19, Vite 8, Vitest 5, Oxlint. Node 24 (`node:crypto` in tests only).

**Spec:** `docs/superpowers/specs/2026-10-30-security-track-phase-1-design.md`

## Global Constraints

- Branch `security-phase-1` (the spec is committed). No worktrees.
- `src/security/` contains no React; all lesson text lives in `src/lessons/`.
- Deterministic: nothing reads the clock or `Math.random`. Entry points never throw. Unusable knobs give one step through `refusal(title, why, EMPTY)`.
- `node:crypto` is imported only in test files.
- Every file in `src/security/crypto/` starts with the comment `// Teaching code: never use this for real data. Use your platform's crypto library.`
- Limits: `MAX_STEPS = 200` steps per lesson run; plain `number`s, moduli below 2^20 for RSA and at most 65537 for Diffie-Hellman.
- Code lines via `lineOf`. Hex is lowercase.
- Lessons: no `complexity`, `codeLabel: 'Pseudocode'`, 4 quiz questions of at least 3 types, at least one `predict-next` whose view comes from a real step and does not reveal the answer. Copy is plain, short sentences with actual values.
- The last paragraph of each lesson's `concept` says what production systems use instead and contains the word "production".
- Lessons register in curriculum order. Each lesson task appends its meta (difficulty `beginner`, group `Cryptography`) and appends its id to `EXPECTED_IDS` in `lessons.test.ts`.
- Commit messages, PR titles and PR bodies contain no AI attribution.
- Every task ends green on `npm run typecheck`, `npm run lint` and `npm test`.

## Rulings (where this plan narrows the spec)

- **Block Modes scenarios:** `patterns` uses the `mode` field. `nonce reuse` always runs CTR. `tampering` always runs CTR and GCM side by side. The `mode` field's help text says so.
- **Nonce reuse:** the known first message is the constant `PUBLIC NOTICE: OFFICE CLOSED` (28 bytes), and the `message` field is the secret second one. Only the first min(28, length) bytes can be recovered, and the step says how many.
- **Tampering:** the attacker XORs `0x08` into the first ASCII digit (`1` → `9`). With no digit, they flip the lowest bit of byte 0, and the step says so.
- **Fixed values:** block-mode key `stepwise-demo-16` (ciphertext first bytes `0x42` for white and `0xfa` for dark, so heat 0.26 and 0.98), CBC and CTR IV `00 01 … 0f`, GCM IV the first 12 of those bytes.
- **Shapes:** `Smiley`, `Stripes`, `Checkerboard`, as 8×8 bitmaps. Each pixel is one 16-byte block of `0x00` or `0xff`.
- **Encrypt always runs the same number twice,** so the determinism lesson needs no preset. Public Keys presets are `61 × 53`, `Sign a message`, `Tampered message`.
- **Tampering a signed message** appends `!`.
- **TLS** uses one key for both directions and a fixed scenario date of `2026-06-01`. Leaf validity is `2026-01-01` to `2026-12-31`, or until `2025-12-31` for the expired attack. The site is `shop.example`, and `wrong-name` presents a real-CA leaf for `evil.example`. Toy keys with e = 17: root (883, 997), intermediate (691, 809), leaf (557, 719), attacker (419, 631).
- **Key Exchange:** Mallory's fixed secret is 6. The eavesdropper's search shows its first 3 tries, then one summary step, not a step per try.
- **Parties view** is used only by Key Exchange and Certificates & TLS. Message Authentication uses grids.
- **`EMPTY`** is `{ kind: 'array', cells: [] }`, in `src/security/steps.ts`.
- **Prerequisites** are only the real dependencies listed under Tasks 9–15. Symmetric Encryption and Key Exchange need nothing, so they don't chain on the lesson before them. The lesson order stays as in the spec.

## Review Focus

- **The one-block boundary:** 55 UTF-8 bytes run, 56 refuse, counted in bytes, so 27 × `é` + `a` (55 bytes, 28 characters) runs. Pinned in Task 9.
- **Compare mode with identical inputs:** 0 bits changed, and no step claims an avalanche. Pinned in Task 9.
- **A key valid for one prime but not another:** secret 50 with prime 23 gives one refusal naming the 2 to 21 range. Pinned in Task 13.
- **A signature that survives tampering on a tiny n:** with n = 143, some `message!` shares `digest mod n` with `message`, so `verify` passes. The step must say this is a collision from the toy size, not claim the tampering failed. Pinned in Task 14.
- **Block-mode messages with no digit, and longer than the known message:** tampering still changes the plaintext and says what it flipped; nonce reuse says how many bytes it recovered. Pinned in Task 12.

## File map

| File | Responsibility |
|---|---|
| `src/security/crypto/bytes.ts` | UTF-8, hex, XOR, concat |
| `src/security/crypto/sha256.ts` | SHA-256, trace, resume |
| `src/security/crypto/hmac.ts` | HMAC, HKDF |
| `src/security/crypto/aes.ts` | AES-128 block encrypt and trace |
| `src/security/crypto/modes.ts` | ECB, CBC, CTR, GCM |
| `src/security/crypto/numbers.ts` | Modular math, Diffie-Hellman groups |
| `src/security/crypto/rsa.ts` | Toy RSA |
| `src/security/crypto/tls.ts` | Shortened TLS 1.3 run |
| `src/security/crypto/differential.test.ts` | Our code against `node:crypto` |
| `src/security/steps.ts` | `MAX_STEPS`, `EMPTY`, view builders |
| `src/security/scenarios/<id>.ts` | `<id>Code`, options, `<id>Steps(values)` |
| `src/security/contract.test.ts` | Every lesson under random and garbage settings |
| `src/lessons/meta/security.ts`, `src/lessons/security/<id>.ts` | Lesson metadata and content |

---

### Task 1: The Security category

**Files:**
- Modify: `src/types/lesson.ts:53`, `src/lessons/labels.ts`, `src/lessons/curriculum.ts`, `src/lessons/lessonList.ts`, `src/lessons/registry.ts:87`, `src/lessons/all.testutil.ts:9`, `src/lessons/split.test.ts:7`, `src/lessons/lessons.test.ts`, `src/components/navigation/SearchPalette.tsx:8`, `src/pages/LessonPage.tsx:46`, `src/components/layout/Header.tsx`
- Create: `src/lessons/meta/security.ts`

**Interfaces:**
- Produces: `Category` includes `'security'`; `securityMeta: LessonMeta[]` (empty for now).

- [ ] **Step 1: Write the failing test.** In `lessons.test.ts`, assert `topicsIn('security').map((t) => t.id)` equals the 23 spec ids in spec order, and `.map((t) => t.group)` equals 7 × `Cryptography`, 8 × `Identity & Access`, 8 × `Web Attacks & Defenses`. Add `expect(lessonsIn('security').map((l) => l.id)).toEqual(topicsIn('security').slice(0, lessonsIn('security').length).map((t) => t.id))`.
- [ ] **Step 2: Run it.** `npx vitest run src/lessons/lessons.test.ts`. Expected: FAIL, and `tsc` rejects `'security'`.
- [ ] **Step 3: Add the category.**
  - `Category` gains `'security'`; `CATEGORY_TITLE` gets `security: 'Security'`.
  - `CATEGORY_INTRO`: `'How software keeps secrets and proves who is who, and how attackers break it when it goes wrong. Each lesson runs the real steps on your input, against a simulated system.'`
  - `curriculum.ts` gets three `topics('security', …)` blocks with the spec's ids and titles.
  - Add `security` to the three globs and `securityMeta` to `lessonList.ts`.
  - `CATEGORY_ICON` gets `security: Shield` (from `lucide-react`).
  - `CODE_COPY` gets `security: { title: 'Pseudocode', label: 'Pseudocode', intro: 'The steps the algorithm takes, as short pseudocode. In the visualization above, the highlighted line follows the step that is running.' }`.
  - Add `lesson.category !== 'security'` to the complexity condition at `lessons.test.ts:208`.
  - In `Header.tsx`, the Main nav link changes `px-3` to `px-2.5 xl:px-3`. Only that nav changes, not the mobile "Sections" nav.
- [ ] **Step 4: Run it.** `npm run typecheck && npm test`. Expected: PASS. If a stale glob shows "No content module", delete `node_modules/.vitest-cache`.
- [ ] **Step 5: Commit.** `git commit -am "Security: add the category with 23 Coming soon topics"` (add the new meta file first).

### Task 2: Bytes and SHA-256

**Files:**
- Create: `src/security/crypto/bytes.ts`, `src/security/crypto/sha256.ts`, `src/security/crypto/sha256.test.ts`, `src/security/crypto/differential.test.ts`

**Interfaces:**
- Produces: `utf8(text: string): Uint8Array`, `hex(bytes: Uint8Array): string`, `fromHex(text: string): Uint8Array`, `xor(a, b): Uint8Array` (length of the shorter), `concat(...parts: Uint8Array[]): Uint8Array`.
- Produces: `sha256(bytes): Uint8Array`; `padding(length: number): Uint8Array` (the bytes appended to a message of that length); `INITIAL_STATE: readonly number[]`; `ROUND_K: readonly number[]`; `traceBlock(state: readonly number[], block: Uint8Array): { schedule: number[]; rounds: number[][]; out: number[] }` (`rounds[i]` is `[a…h]` after round i, `out` the state after the final add); `resume(digest: Uint8Array, bytesSoFar: number, extra: Uint8Array): Uint8Array`.

- [ ] **Step 1: Write the failing tests.**
  - `sha256(utf8('abc'))` is `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
  - `sha256(utf8(''))` is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
  - `traceBlock(INITIAL_STATE, paddedAbc).rounds` has 64 entries, and `out` serialises to the `abc` digest.
  - For `m` of length 10, `resume(sha256(m), 64, extra)` equals `sha256(concat(m, padding(10), extra))`.
  - `differential.test.ts`: seeded inputs (`seeded`, 200 runs, lengths 0–300 plus each of 55, 56, 63, 64, 65) agree with `createHash('sha256')`.
- [ ] **Step 2: Run them.** `npx vitest run src/security/crypto`. Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** `bytes.ts` and `sha256.ts`. `sha256` hashes through `traceBlock`, and `resume` restarts from the digest's 8 words with total length `bytesSoFar + extra.length`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: SHA-256 with a round trace and resume`

### Task 3: HMAC and HKDF

**Files:**
- Create: `src/security/crypto/hmac.ts`, `src/security/crypto/hmac.test.ts`
- Modify: `src/security/crypto/differential.test.ts`

**Interfaces:**
- Consumes: `sha256`, `concat`, `xor`.
- Produces: `hmacParts(key, message): { innerKey: Uint8Array; outerKey: Uint8Array; inner: Uint8Array; outer: Uint8Array }`; `hmac(key, message): Uint8Array`; `hkdfExtract(salt, ikm): Uint8Array`; `hkdfExpand(prk, info, length: number): Uint8Array`.

- [ ] **Step 1: Write the failing tests.** RFC 4231 case 1: key 20 × `0x0b`, data `Hi There`, tag `b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7`. Differential: `createHmac` with keys of 0, 16, 64 and 100 bytes, and `hkdfSync('sha256', …)` for lengths 16, 32 and 64.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** per RFC 2104 and RFC 5869. Keys over 64 bytes are hashed first.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: HMAC and HKDF`

### Task 4: AES-128 with ECB, CBC and CTR

**Files:**
- Create: `src/security/crypto/aes.ts`, `src/security/crypto/aes.test.ts`, `src/security/crypto/modes.ts`
- Modify: `src/security/crypto/differential.test.ts`

**Interfaces:**
- Produces: `expandKey(key: Uint8Array): Uint8Array[]` (11 round keys); `encryptBlock(key, block): Uint8Array`; `type AesOp = { round: number; op: 'SubBytes' | 'ShiftRows' | 'MixColumns' | 'AddRoundKey'; state: Uint8Array }`; `traceBlock(key, block): { roundKeys: Uint8Array[]; ops: AesOp[]; out: Uint8Array }`.
- Produces: `ecb(key, bytes)`, `cbc(key, iv, bytes)` (length a multiple of 16, no padding), `ctr(key, iv, bytes)` (128-bit big-endian counter, any length; also decrypts).

- [ ] **Step 1: Write the failing tests.**
  - FIPS-197 C.1: key `000102030405060708090a0b0c0d0e0f`, block `00112233445566778899aabbccddeeff`, output `69c4e0d86a7b0430d8cdb78070b4c55a`.
  - `traceBlock(...).ops` has 41 entries: round 0 AddRoundKey, 9 × 4, then 3 in round 10 with no MixColumns.
  - `ctr` twice returns the input.
  - Differential: `aes-128-ecb` and `aes-128-cbc` (`setAutoPadding(false)`) and `aes-128-ctr`, including an IV of 16 × `0xff` to pin counter wrap.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The S-box is a literal table; `encryptBlock` returns `traceBlock(...).out`. The state is column-major, as in FIPS-197.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: AES-128 with ECB, CBC and CTR`

### Task 5: AES-GCM

**Files:**
- Modify: `src/security/crypto/modes.ts`, `src/security/crypto/differential.test.ts`
- Create: `src/security/crypto/modes.test.ts`

**Interfaces:**
- Produces: `gcmEncrypt(key, iv, plain, aad?: Uint8Array): { ciphertext: Uint8Array; tag: Uint8Array }`; `gcmDecrypt(key, iv, ciphertext, tag, aad?: Uint8Array): Uint8Array | null`.

- [ ] **Step 1: Write the failing tests.** Differential against `aes-128-gcm` with a 12-byte IV: empty plain, empty aad, lengths 1–64, and ciphertext and tag both compared. `gcmDecrypt` undoes `gcmEncrypt`. Flipping any one bit of ciphertext, tag or aad gives `null`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** J0 = IV ‖ `00000001`, a 32-bit counter (`inc32`), and GHASH on BigInt per SP 800-38D. Compare tags over every byte.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: AES-128-GCM`

### Task 6: Modular math and toy RSA

**Files:**
- Create: `src/security/crypto/numbers.ts`, `src/security/crypto/numbers.test.ts`, `src/security/crypto/rsa.ts`, `src/security/crypto/rsa.test.ts`

**Interfaces:**
- Consumes: `sha256`, `utf8`.
- Produces: `modPow(base, exp, mod): number`; `gcd(a, b): number`; `modInverseTrace(a, m): { rows: { q: number; r: number; t: number }[]; inverse: number | null }`; `modInverse(a, m): number | null`; `isPrime(n): boolean`; `GROUPS: readonly { p: number; g: number }[]` = (23, 5), (227, 2), (65537, 3).
- Produces: `type RsaKey = { n: number; e: number; d: number; phi: number }`; `keyPair(p, q, e): RsaKey | null`; `encrypt(m, key)`, `decrypt(c, key)`; `digestNumber(message: string, n: number): number` (SHA-256 read big-endian, modulo n); `sign(message, key): number`; `verify(message, signature, key): boolean`.

- [ ] **Step 1: Write the failing tests.**
  - `keyPair(61, 53, 17)` is `{ n: 3233, e: 17, d: 2753, phi: 3120 }`; `encrypt(65, k)` is 2790; `decrypt(2790, k)` is 65.
  - `decrypt` undoes `encrypt` for every m below 3233.
  - `modPow(5, 6, 23)` is 8, `modPow(5, 15, 23)` is 19, `modPow(19, 6, 23)` is 2.
  - Each group's g has order p − 1.
  - `modInverse(a, m) * a % m` is 1 for coprime pairs, and `null` otherwise.
  - `keyPair(61, 61, 17)`, `keyPair(60, 53, 17)` and `keyPair(11, 13, 3)` (not coprime with φ = 120) are `null`.
  - `verify` accepts a signature and refuses `message + '!'` under the (883, 997) key.
  - For the largest n, 997 × 991 = 988027, `modPow(n - 1, 3, n)` equals `n - 1` (no overflow).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `digestNumber` reduces byte by byte, so nothing leaves the safe range.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: modular math and toy RSA`

### Task 7: The TLS handshake

**Files:**
- Create: `src/security/crypto/tls.ts`, `src/security/crypto/tls.test.ts`

**Interfaces:**
- Consumes: `modPow`, `GROUPS`, `keyPair`, `sign`, `verify`, `sha256`, `hmac`, `hkdfExtract`, `hkdfExpand`, `gcmEncrypt`, `gcmDecrypt`.
- Produces:
  - `TLS_ATTACKS = ['none', 'self-signed', 'expired', 'wrong-name', 'tampered-record'] as const`; `type TlsAttack`.
  - `type Certificate = { subject: string; issuer: string; notBefore: string; notAfter: string; publicKey: { n: number; e: number }; signature: number }`.
  - `type TlsEvent = { id: 'client-hello' | 'server-hello' | 'keys' | 'certificate' | 'certificate-verify' | 'chain-check' | 'date-check' | 'name-check' | 'server-finished' | 'client-finished' | 'record' | 'closed'; from?: 'client' | 'attacker' | 'server'; to?: 'client' | 'attacker' | 'server'; ok: boolean; detail: string; values: Record<string, string> }`.
  - `runHandshake(attack: TlsAttack): { events: TlsEvent[]; stoppedAt?: 'chain' | 'date' | 'name' | 'record'; clientKey?: Uint8Array; serverKey?: Uint8Array; plaintext?: string }`.

- [ ] **Step 1: Write the failing tests.**
  - `none`: no `stoppedAt`, `hex(clientKey)` equals `hex(serverKey)`, `plaintext` is the record the server sent, and event ids run `client-hello, server-hello, keys, certificate, certificate-verify, chain-check…, date-check, name-check, server-finished, client-finished, record`.
  - `chain-check` appears once per chain certificate (2 before reaching the trust store).
  - `stoppedAt` is `chain` for `self-signed`, `date` for `expired`, `name` for `wrong-name`, `record` for `tampered-record`.
  - Each failing run ends with `closed`, and no `record` event with `ok: true` follows a failed check.
  - Two runs of one attack are deep-equal.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** per the spec's Handshake section and this plan's Rulings. Use the group p = 65537; client secret 12345, server secret 54321, attacker secret 6789. Signed certificate data is `JSON.stringify` of every field but `signature`. Keys: `hkdfExpand(hkdfExtract(new Uint8Array(0), sharedSecretAs4Bytes), label, n)` with labels `key` (16), `iv` (12), `finished` (32). Finished is `hmac(finishedKey, sha256(transcript))`, where the transcript is the concatenated message strings so far.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: a shortened TLS 1.3 handshake`

### Task 8: View builders and the attacker node

**Files:**
- Create: `src/security/steps.ts`, `src/security/steps.test.ts`
- Modify: `src/types/visualization.ts` (`ServicesView` node `type`), `src/components/visualization/renderers/ServicesRenderer.tsx:18,144`

**Interfaces:**
- Produces: `MAX_STEPS = 200`; `EMPTY: ArrayView`; `byteGrid(bytes, prefix: string, role?: (index: number) => Role): GridView` (rows of 8, labels are offsets); `stateGrid(state, prefix, role?): GridView` (4×4, column-major); `imageGrid(heats: number[], values: string[], prefix: string): GridView` (8×8); `compareDigests(a, b): { view: PanelsView; bits: number }`; `partiesView(input: { attacker: boolean; messages: { from: string; to: string; label: string; role: Role }[]; known: { party: string; values: string[] }[]; columns: string[]; log: string[] }): PanelsView`.

- [ ] **Step 1: Write the failing tests.**
  - `byteGrid` of 20 bytes gives 3 rows, with cell ids unique and stable across calls.
  - `stateGrid` puts byte 1 at row 1, column 0.
  - `compareDigests` of two equal digests gives `bits` 0, and of `00…` and `ff…` gives 256.
  - `partiesView` with `attacker: false` has no `attacker` node and a direct client–server link; with `true` it has the attacker in column 1 and links through it.
  - All ids in a built view are unique.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `partiesView` returns `panels` with `{ label: 'On the wire', view: services }` and `{ label: 'Who knows what', view: grid }`. Node types are `client`, `attacker` and `service`; `requests: []`; messages get `progress: 0.5`. Add `attacker: 'attacker'` to `TYPE_NAME`. In the `aria-label`, leave out the requests part when `view.requests.length === 0`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `Security: shared view builders and an attacker node`

### Tasks 9–15: one lesson each

Each task creates `src/security/scenarios/<id>.ts`, `src/security/scenarios/<id>.test.ts` and `src/lessons/security/<id>.ts`, and modifies `src/lessons/meta/security.ts` and `lessons.test.ts`.

Steps for each:

- [ ] **Step 1: Write the failing scenario test** with the assertions below.
- [ ] **Step 2: Run it.** `npx vitest run src/security/scenarios/<id>.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the scenario:** `<camelId>Code`, the option arrays, and `<camelId>Steps(values: Record<string, string>): Step[]`. Read fields with `readChoice`, `readInt` and `readText`, then check byte lengths on `utf8(text).length`.
- [ ] **Step 4: Write the lesson and meta** with the fields and presets below, per the Global Constraints. Add the id to `EXPECTED_IDS`.
- [ ] **Step 5: Run everything.** `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 6: Commit.** `Security: <lesson title> lesson`

**Task 9 also creates `src/security/contract.test.ts`** (modelled on `src/ai/contract.test.ts`): `RANGES` for number fields, code labelled `Pseudocode`, 20 random runs per seed staying within `MAX_STEPS`, valid code lines, heat in 0–1, unique ids per view, garbage in a number or choice field gives exactly one step, and runs repeat exactly. Each later lesson adds its `RANGES`. It also adds a `lessons.test.ts` test: every Security lesson's last `concept` paragraph contains `production`.

| Task | Lesson (id; fields) | Presets | Scenario test assertions |
|---|---|---|---|
| 9 | Hash Functions (`hash-functions`; `mode` choice `Inside one hash`/`Compare two inputs`, `text`, `text2`) | `abc`; `One letter changed` (compare `abc`, `abd`); `Empty text` | Default run's last step shows the `abc` digest and has `steps.length` between 67 and 75. Compare `abc`/`abd` reports the real bit count, over 90. Compare identical texts reports 0 bits and no title or why contains `avalanche`. 55 bytes (27 × `é` + `a`) runs. 56 bytes gives one refusal. Empty text runs. |
| 10 | Message Authentication (`message-authentication`; `scheme` choice `SHA-256(key + message)`/`HMAC`, `key`, `message`, `extension`) | `Forge the naive tag`; `Same forgery on HMAC` | Default `secret-key`, `amount=100&to=alice`, `&to=mallory`. Naive: last step says accepted, and the forged tag equals `sha256(key ‖ forged message)`. HMAC: last step says rejected. No step's `variables` or view contains the key's hex on the attacker's turn. Key 17 bytes, message 33 bytes or extension 17 bytes refuse. |
| 11 | Symmetric Encryption (`symmetric-encryption`; `text`, `key`) | `Short text`; `Full 16 bytes`; `One key byte changed` | Last step's output hex equals `encryptBlock` on the padded input. Step count 43–46. A short text's first step says it was padded with zero bytes. Text of 17 bytes refuses, and so does `é` × 9 as key (18 bytes). `key` of 0 bytes refuses. |
| 12 | Block Modes & AEAD (`block-modes`; `scenario` choice `Patterns`/`Nonce reuse`/`Tampering`, `mode` choice `ECB`/`CBC`/`CTR`/`GCM`, `shape` choice, `message`) | `Patterns`; `Nonce reuse`; `Tampering` | `Patterns` with `ECB` on `Smiley`: final image has exactly 2 distinct ciphertext values, heats 0.26 and 0.98 (rounded). `CBC`, `CTR` and `GCM` show over 40 distinct cell values (each cell shows one byte, so a few repeat by chance). `Nonce reuse`: recovers `message` fully when it is 28 bytes or fewer, and a 32-byte message reports 28 recovered. `Tampering` on `pay $100 to bob`: CTR shows `pay $900 to bob` accepted, GCM refuses. On `no numbers` the step names byte 0's lowest bit. Message of 33 bytes refuses. |
| 13 | Key Exchange (`key-exchange`; `prime` choice `23`/`227`/`65537`, `a`, `b`, `attacker` choice `None`/`Eavesdropper`/`Man in the middle`) | `No attacker` (23, 6, 15); `Eavesdropper`; `Man in the middle` | Default: A = 8, B = 19, shared 2 in the last step. Eavesdropper finds a = 6 after 6 tries on prime 23, and with prime 65537 the run stays within 12 steps. Man in the middle: the step shows Alice's and Bob's keys and says Mallory holds both. Secret 50 with prime 23 gives one refusal containing `2 to 21`. Uses `partiesView`. |
| 14 | Public Keys & Signatures (`public-key-signatures`; `operation` choice `Encrypt`/`Sign`, `p`, `q`, `e`, `number`, `message`, `tamper` choice `No`/`Yes`) | `61 × 53`; `Sign a message`; `Tampered message` | Default shows n 3233, φ 3120, d 2753 and each Euclid row; 65 → 2790 → 65; encrypting twice gives the same value. Sign then verify passes. Tamper fails on the 61 × 53 key for the default message. Search messages `m0…` on n = 143 for one whose `m!` shares `digestNumber`: verify passes and the step's `why` contains `collision`. `p` 60, `p = q`, `e` 3 with (11, 13), and `number` 3233 each refuse. |
| 15 | Certificates & TLS (`certificates-tls`; `attack` choice from `TLS_ATTACKS`) | one per attack | `none`: last step shows the decrypted record. Each attack's last step is titled with its failed check and says the connection closed. No step's view shows the attacker in the `none` run. Every event of `runHandshake` maps to at least one step. |

**Prerequisites (meta):** `hash-functions`: none. `message-authentication`: `hash-functions`. `symmetric-encryption`: none. `block-modes`: `symmetric-encryption`. `key-exchange`: none. `public-key-signatures`: `hash-functions`. `certificates-tls`: `key-exchange`, `public-key-signatures`, `block-modes`.

**Task 13 browser check:** open Key Exchange at 375 px with the man-in-the-middle preset. If the `services` panel is unreadable, switch `partiesView`'s first panel to the spec's text-grid ladder, keeping its signature, before moving on.

**Task 15 lesson text** states that certificates are simplified, key derivation is one HKDF step, and one key serves both directions.

### Task 16: Docs and final checks

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Update the docs.** `CLAUDE.md`: add Security to the intro sentence, add `security/` to the no-React list, add a **Security** architecture entry and a `src/security/contract.test.ts` entry under the tests that guard the codebase. `README.md`: the track list and project layout. The `View` kind count stays 18.
- [ ] **Step 2: Run CI's checks.** `npm run lint && npm test && npm run build:pages && npm run check:bundle`. Expected: all pass, first load under 600 kB.
- [ ] **Step 3: Check by hand.** `npm run dev`, then in a browser at 375 px and 1024 px, light and dark: the header fits on one row at 1024 px, the seven lessons open, the ECB image shows its shape, the parties view is readable, and `/security` lists 16 Coming soon topics. Compare one lesson's digest with `printf abc | shasum -a 256`.
- [ ] **Step 4: Commit.** `Docs: Security track phase 1`
