# Automatic GitHub Pages Deploys Implementation Plan

> Written on 2026-10-18 as a record of how PR #4 was built (branch `ci/pages-deploy`, commit `62eb18f`, merge `8c65d70`). Every box is checked because the work is done.

**Goal:** Deploy to GitHub Pages on every push to `main`, and only when the tests pass.

**Architecture:** One GitHub Actions workflow runs install → test → `build:pages` → upload → deploy, using the official Pages actions.

**Tech Stack:** GitHub Actions, Node LTS, npm.

**Spec:** `docs/superpowers/specs/2026-10-15-pages-deploy-design.md`

## Global Constraints

- The build command is `npm run build:pages`, the same as a local build.
- Nothing is published when `npm test` fails.
- Only one deploy runs at a time; a newer push cancels an older run.

## Review Focus

1. **A failing test on `main`**: expect the run to stop before upload, with the live site unchanged. Covered by the step order in Task 1.
2. **Two quick pushes**: expect the second run to replace the first. Covered by the concurrency group in Task 1.
3. **Deep links after a CI build**: expect `/stepwise/<category>/<id>` to load. Covered by `404.html` from `build:pages`, checked after the merge.

---

### Task 1: Workflow and README (`62eb18f`)

**Files:** create `.github/workflows/deploy.yml`; modify `README.md` ("Publishing to GitHub Pages").

- [x] Write the workflow with the triggers, permissions, concurrency and steps listed in the spec.
- [x] Rewrite the README publishing section for the automatic flow and the required "Pages → Source: GitHub Actions" setting.
- [x] Commit.

### Task 2: Settings, PR and first deploy

- [x] Set the repository's Pages source to GitHub Actions.
- [x] Open PR #4 and merge it on 2026-10-15.
- [x] Confirm the deploy run on `main` succeeded and the site loads, including a deep link.
