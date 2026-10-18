# Automatic GitHub Pages deploys

Date: 2026-10-15
Status: as built. Written on 2026-10-18 from PR #4 (`ci/pages-deploy`, merge `8c65d70`); no spec was written at the time.

## Goal

Publish the site on every push to `main`, without anyone building it locally and pushing `dist/` to a `gh-pages` branch by hand. Never publish a build whose tests fail.

## Decisions

- Use GitHub Actions with the official Pages actions; GitHub hosts the uploaded build directly, so the `gh-pages` branch is no longer needed.
- Keep `npm run build:pages` as the single build command, so a local build and a CI build are the same (base `/stepwise/`, with `404.html` copied from `index.html` for deep links).
- The workflow can also be run by hand from the Actions tab.

## Workflow (`.github/workflows/deploy.yml`)

- Triggers: `push` to `main`, and `workflow_dispatch`.
- Permissions: `contents: read`, `pages: write`, `id-token: write`.
- Concurrency group `pages` with `cancel-in-progress: true`, so a newer push replaces a deploy still running.
- One job, `deploy`, on `ubuntu-latest` in the `github-pages` environment; the environment URL comes from the deploy step's `page_url` output.
- Steps:
  1. `actions/checkout@v7`
  2. `actions/setup-node@v7` with Node `lts/*` and the npm cache
  3. `npm ci`
  4. `npm test`: a failure stops the run and nothing is published
  5. `npm run build:pages`
  6. `actions/configure-pages@v6`
  7. `actions/upload-pages-artifact@v5` with `path: ./dist`
  8. `actions/deploy-pages@v5` (id `deployment`)

## Repository settings

- Pages → Source must be **GitHub Actions**. After the first successful deploy, the `gh-pages` branch is unused.

## README

- The "Publishing to GitHub Pages" section describes the automatic flow, the manual run, the test gate and the required Pages setting. It keeps the note about changing the base path if the repository is renamed.

## Verification

- After the merge, the run on `main` succeeds and https://vanmanh49.github.io/stepwise/ serves the new build, including deep links such as `/stepwise/algorithms/bfs`.

## Out of scope

- Preview deploys for pull requests.
- A separate test workflow for pull requests; tests run only as part of the deploy.
