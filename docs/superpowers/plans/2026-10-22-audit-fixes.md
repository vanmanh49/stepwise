# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four findings of the 2026-10-22 whole-repo audit: a blank site when storage is blocked, a `LIKE` pattern that freezes the tab, CI that never runs on pull requests, and a progress count copied into four files.

**Architecture:** Four small, independent changes on one branch and one PR. No new dependencies, files or layers, apart from one CI workflow file.

**Tech Stack:** TypeScript 7, React 19, Zustand 5 (`persist`), Vitest 5, GitHub Actions.

**Spec:** this plan stands in for a spec. The findings it fixes are:

1. `src/store/progress.ts:117`: `typeof localStorage` throws a `SecurityError` when the browser blocks site data. The module fails while loading and the app renders nothing.
2. `src/sql/values.ts:117-127`: `like()` compiles the pattern to a regex. Many `%` cause catastrophic backtracking: one 24-character value against `'%%%%%%%%%%x'` took 1.4 s, and each extra `%` multiplies that. The regex is also rebuilt for every row.
3. `.github/workflows/deploy.yml`: lint, tests and build run only on pushes to `main`, never on pull requests.
4. `pages/Catalog.tsx:30`, `navigation/CourseSidebar.tsx:13`, `pages/Home.tsx:43-44` and `pages/Dashboard.tsx:29-30` each repeat `list.filter((l) => completed.includes(l.id)).length`.

## Global Constraints

- Work in the `stepwise` folder on branch `fix/audit-findings`, created from an up-to-date `main`. No git worktrees.
- Commit messages, PR title and PR body contain no AI attribution: no `Co-Authored-By` trailer for an AI and no "Generated with" line.
- `like()` keeps today's results exactly: SQLite semantics, `%` matches any run (including empty), `_` matches exactly one character (a Unicode code point, as the regex `u` flag does now), only ASCII letters ignore case, and `.` style newlines are ordinary characters.
- Done means `npm run lint`, `npm run typecheck` and `npm test` all pass.

## Review Focus

- A `LIKE` that needs backtracking past a partial match (`'abcabd' LIKE '%abd'`) must still be true. A naive greedy matcher gets it wrong. Pinned in Task 2's unit test.
- Empty value or empty pattern (`'' LIKE ''`, `'' LIKE '%'`, `'' LIKE '_'`). Pinned in Task 2.
- Non-ASCII characters: `'é' LIKE '_'` is true and `'Ä' LIKE 'ä'` is false (SQLite folds only ASCII). Pinned in Task 2.
- Storage blocked: the app must still work for the session and only lose saving. Pinned in Task 1 by acting on the store after import.
- A completed id for a lesson that no longer exists must not raise any count. Pinned in Task 4.

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout main && git pull && git checkout -b fix/audit-findings`
- [ ] **Step 2:** Commit this plan: `git add docs/superpowers/plans/2026-10-22-audit-fixes.md && git commit -m "Docs: audit fixes plan"`

### Task 1: Progress store survives blocked storage

**Files:**
- Modify: `src/store/progress.ts:112-125`
- Test: `src/store/progress.test.ts`

**Interfaces:** none new. `useProgress` keeps its type.

- [ ] **Step 1: Write the failing test** (add `vi` to the vitest import)

```ts
describe('blocked storage', () => {
  it('still loads and works when reading localStorage throws', async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      const { useProgress } = await import('./progress');
      useProgress.getState().markComplete('array');
      expect(useProgress.getState().completed).toEqual(['array']);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
```

- [ ] **Step 2:** `npx vitest run src/store/progress.test.ts -t "blocked storage"`. Expected: FAIL with `SecurityError: denied` thrown from the import.
- [ ] **Step 3:** In `progress.ts`, replace the `typeof localStorage === 'undefined'` condition with a module constant `hasStorage`. Compute it in a try/catch IIFE that returns `typeof localStorage !== 'undefined'` and returns `false` on any error. Add a one-line comment: reading `localStorage` throws when the browser blocks site data.
- [ ] **Step 4:** `npx vitest run src/store/progress.test.ts`. Expected: all pass.
- [ ] **Step 5:** `git commit -am "Progress: start without saving when the browser blocks storage"`

### Task 2: `LIKE` without regex backtracking

**Files:**
- Modify: `src/sql/values.ts:114-127` (`like`. `asciiLower` stays.)
- Test: `src/sql/values.test.ts` (`describe('like')`, line 66), `src/sql/corpus.testutil.ts` (LIKE block, lines 53-59)

**Interfaces:** `like(value: SqlValue, pattern: SqlValue): Truth` keeps its signature. Its only caller is `evaluate.ts:235`.

- [ ] **Step 1: Write the failing tests** in `describe('like')`

```ts
it('backtracks past partial matches and handles empty strings', () => {
  expect(like('abcabd', '%abd')).toBe(true);
  expect(like('aXbXc', '%b%c')).toBe(true);
  expect(like('ab', 'a%%b')).toBe(true);
  expect(like('abc', '%b')).toBe(false);
  expect(like('', '')).toBe(true);
  expect(like('', '%')).toBe(true);
  expect(like('', '_')).toBe(false);
  expect(like('a\nb', 'a_b')).toBe(true);
});

it('treats characters as code points and folds only ASCII case', () => {
  expect(like('é', '_')).toBe(true);
  expect(like('😀x', '_x')).toBe(true);
  expect(like('ABC', 'abc')).toBe(true);
  expect(like('Ä', 'ä')).toBe(false);
});

it('stays fast on patterns full of %', () => {
  const start = performance.now();
  expect(like('a'.repeat(200), '%a'.repeat(30) + '%b')).toBe(false);
  expect(like('alice.nguyen@example.com', '%'.repeat(40) + 'x')).toBe(false);
  expect(performance.now() - start).toBeLessThan(50);
});
```

- [ ] **Step 2:** `npx vitest run src/sql/values.test.ts -t like`. Expected: the first two tests PASS (today's regex is correct), and "stays fast" FAILS on time or hangs. Stop the run after about 10 s, since the hang is the failure.
- [ ] **Step 3: Implement `like`** with a two-pointer wildcard matcher over `[...asciiLower(formatValue(x))]` arrays. Keep the NULL check and the doc comment. Algorithm:

```
t = p = 0; star = -1; mark = 0
while t < text.length:
  if p < pat.length and (pat[p] == '_' or pat[p] == text[t]): t++, p++
  elif p < pat.length and pat[p] == '%': star = p++, mark = t
  elif star >= 0: p = star + 1, t = ++mark
  else: return false
skip trailing '%' in pat
return p == pat.length
```

- [ ] **Step 4:** Add these to the LIKE block of `corpus.testutil.ts`, so they are compared with real SQLite:

```ts
shop("SELECT name FROM customers WHERE name LIKE '%a%e%'"),
shop("SELECT name FROM customers WHERE name LIKE '%%'"),
shop("SELECT name FROM customers WHERE name LIKE '_%_'"),
shop("SELECT name FROM customers WHERE name LIKE ''"),
shop("SELECT name FROM products WHERE name LIKE '%o%o%'"),
```

- [ ] **Step 5:** `npx vitest run src/sql`. Expected: all pass, including `differential*.test.ts`.
- [ ] **Step 6:** `git commit -am "SQL: match LIKE without regex backtracking"`

### Task 3: CI on pull requests

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `CLAUDE.md` (the sentence "CI runs `npm run lint`, …")

- [ ] **Step 1:** Create `ci.yml`: `name: CI`, `on: pull_request`, `permissions: contents: read`, and one job `check` on `ubuntu-latest`. Its steps are the same as `deploy.yml` up to and including `npm run check:bundle`: checkout v7, setup-node v7 (`lts/*`, `cache: npm`), `npm ci`, lint, test, `build:pages`, `check:bundle`. No Pages steps.
- [ ] **Step 2:** In `CLAUDE.md`, change the CI sentence to say these checks run on every pull request and again before each deploy from `main`.
- [ ] **Step 3:** `git add .github/workflows/ci.yml CLAUDE.md && git commit -m "CI: run lint, tests and build on pull requests"`
- [ ] **Step 4 (verified by the PR):** opening the PR runs `CI / check`. Expected: green. Making it a required check on `main` is a GitHub setting. Ask the user before changing it.

### Task 4: One helper for "lessons done"

**Files:**
- Modify: `src/store/progress.ts` (next to `percent`), `src/pages/Catalog.tsx:30`, `src/components/navigation/CourseSidebar.tsx:13`, `src/pages/Home.tsx:42-44`, `src/pages/Dashboard.tsx:29-30,64-65`
- Test: `src/store/progress.test.ts`

**Interfaces:**
- Produces: `export function countDone(list: readonly { id: string }[], completed: readonly string[]): number`. It returns how many lessons in `list` have their id in `completed`.

- [ ] **Step 1: Write the failing test**

```ts
describe('countDone', () => {
  it('counts listed lessons only, once each', () => {
    expect(countDone([{ id: 'a' }, { id: 'b' }], ['b', 'gone', 'b'])).toBe(1);
    expect(countDone([], ['a'])).toBe(0);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/store/progress.test.ts -t countDone`. Expected: FAIL, `countDone` is not exported.
- [ ] **Step 3:** Implement `countDone` with the existing filter/includes expression. Replace the four copies:
  - Catalog and CourseSidebar: `countDone(live, completed)`.
  - Home: `done(category)` becomes `countDone(lessonsIn(category), completed)`, and `live` becomes `countDone(lessons, completed)`.
  - Dashboard: `doneLessons` becomes `const doneCount = countDone(lessons, completed)`, used on lines 64-65, and `done(category)` uses `countDone`.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test`. Expected: all pass.
- [ ] **Step 5:** `git commit -am "Progress: one helper for counting completed lessons"`

### Task 5: Ship

- [ ] **Step 1:** Check by hand with `npm run dev`. With site data blocked in Chrome (Settings → Privacy → Third-party cookies → "Block all cookies"), the home page and a lesson load. In the "LIKE" SQL lesson, `SELECT * FROM customers WHERE email LIKE '%%%%%%%%%%%%x'` returns no rows at once.
- [ ] **Step 2:** Push and open the PR: `git push -u origin fix/audit-findings && gh pr create --title "Fix audit findings: blocked storage, LIKE freeze, PR checks"`. The body lists the four findings and the tests that pin each one, with no AI attribution. Do not merge without the user's approval.
