# Release and Commit Governance Design

**Date:** 2026-09-19

## Goal

Make `@brkn-labs/judge` a public, releasable npm package with Changesets,
OIDC-only publishing, strict Conventional Commit enforcement, fast local Git
hooks, and authoritative cached GitHub Actions checks.

## Scope

This change covers four connected concerns:

1. make the GitHub repository and npm package public;
2. manage versions, changelogs, release pull requests, tags, GitHub releases,
   and npm publishing with Changesets;
3. enforce Conventional Commits and explicit Changeset decisions locally and
   in CI; and
4. run linting, type checking, tests, builds, and package checks in cached CI.

No `README` file will be created or modified in this work. Contributor guidance
will live in `CONTRIBUTING.md`, and release/operator guidance will live in
`docs/releasing.md`. README updates are intentionally deferred until the end of
the broader project.

## Decisions

### Public repository and package

The GitHub repository `Illusion47586/judge` will become public. Repository merge
settings will allow squash merges only; merge commits and rebase merges will be
disabled. This makes the validated pull-request title the commit subject that
lands on `main`.

`package.json` will:

- remove `"private": true`;
- keep the package name `@brkn-labs/judge`;
- declare the package as MIT licensed and ship the canonical `LICENSE` grant
  with `Copyright (c) 2026 Dhruv Tiwari`;
- add `publishConfig.access: "public"`;
- add canonical repository, homepage, and issue-tracker metadata pointing to
  `https://github.com/Illusion47586/judge`; and
- retain the current files allowlist, build, and prepack behavior.

The implementation pull request will contain a minor Changeset so the first
Changesets-managed release becomes `0.1.0` from the existing `0.0.0` version.

### Changesets

Use `@changesets/cli` v3 and `changesets/action` v2, pinned to verified stable
major releases. `.changeset/config.json` will use:

- `baseBranch: "main"`;
- `access: "public"`;
- the standard Changesets changelog generator;
- `commit: false`, because GitHub Actions owns release commits; and
- no private-package versioning, because this package becomes public.

Package scripts will expose clear entry points for creating a Changeset,
versioning packages, checking status, and publishing. The publish script will
build before invoking `changeset publish`.

Every ordinary pull request must add one new `.changeset/*.md` file. A change
that should not release the package must still add an explicit empty Changeset,
created with Changesets' `--empty` option. This makes release intent reviewable
instead of silently inferring it from file paths or commit types.

A small dependency-free Node policy script will inspect the Git diff between
the pull request base and head. It will accept a newly added Changeset Markdown
file and reject a pull request without one. It will exempt only the generated
Changesets release branch, whose purpose is to consume and delete accumulated
Changesets. Its parsing and branch rules will have unit tests.

The hosted Changeset Bot GitHub App will also be installed for contributor
feedback and its one-click Changeset authoring link. The bot is advisory; the
required CI policy remains authoritative because the hosted bot does not create
release pull requests or enforce the repository's stricter empty-Changeset rule.

### Conventional Commits

Use `@commitlint/cli` with `@commitlint/config-conventional`. The standard type,
subject, header, footer, and breaking-change rules are authoritative; the
project will not invent a separate commit grammar.

Husky will install hooks through the package `prepare` script:

- `.husky/pre-commit` runs `npm run lint` followed by `npm run typecheck`;
- `.husky/commit-msg` runs Commitlint against the pending commit message.

CI remains authoritative because local hooks can be disabled. On pull requests,
CI will validate every commit between the base SHA and head SHA and separately
pipe the pull-request title through Commitlint. On pushes to `main`, CI will
validate the landed commit. The Changesets release action will use
`chore(release): version package` for both its generated commit and pull-request
title so automation follows the same policy.

### Continuous integration

`.github/workflows/ci.yml` will run on pull requests and pushes to `main` with
read-only repository permissions. It will contain two responsibilities:

1. A policy job validates commits, the pull-request title, and the required
   Changeset decision.
2. A test matrix runs on Node `22.18` (the declared minimum) and Node `24`
   (current LTS), executes `npm run check`, builds the package, and exercises
   `npm pack --dry-run`.

Each CI job will cache the actual `node_modules` directory with
`actions/cache`. The exact cache key includes runner OS, architecture, Node
version, and the `package-lock.json` hash. The workflow will run `npm ci` only
on a cache miss. It will not use a broad restore prefix, so dependencies from a
different lockfile or Node version cannot be restored as a usable hit.

Branch protection for `main` will require the policy job and both Node matrix
checks. No review-count rule is added by this scope.

### Release workflow and OIDC publishing

`.github/workflows/release.yml` will run on pushes to `main`. It will use the
stable Changesets v2 sub-actions instead of the combined action so permissions
stay separated:

1. `select-mode` determines whether to version, publish, or do nothing.
2. `version` keeps the workflow token read-only, mints a short-lived token from
   the release GitHub App's contents and pull-request permissions, then creates
   or updates the conventionally named release pull request.
3. `publish` receives `id-token: write` and only the GitHub permissions required
   to create tags and GitHub releases, then runs the build-and-publish script.

Release jobs always use a fresh `npm ci`; they do not restore dependency caches.
This follows npm's trusted-publishing guidance to disable caching in release
builds. The workflow uses a GitHub-hosted runner, a Node/npm version that
supports npm trusted publishing, and `registry-url` for npm. It defines no npm
token and has no token fallback.

Publishing therefore fails closed until OIDC is bootstrapped. The one-time
operator sequence is:

1. ensure the `brkn-labs` npm organization exists and the maintainer can publish
   `@brkn-labs/judge`;
2. manually publish public version `0.0.0` from a clean, verified checkout;
3. in npm package settings, register the GitHub Actions trusted publisher for
   owner `Illusion47586`, repository `judge`, and workflow `release.yml`;
4. enable GitHub Actions to create pull requests in repository settings; and
5. merge the generated release pull request, allowing OIDC to publish `0.1.0`
   with automatic provenance.

The version job will not use the built-in `GITHUB_TOKEN` to author release pull
requests. GitHub requires manual approval for CI started by pull requests that
the built-in token creates or updates. Instead, a repository-owned GitHub App
with only repository contents and pull-request write permissions will be
installed on `Illusion47586/judge`. The workflow will mint a short-lived
installation token with `actions/create-github-app-token` from repository
configuration (`RELEASE_APP_CLIENT_ID` and `RELEASE_APP_PRIVATE_KEY`) and pass that
token to the Changesets version action. This allows required CI to run
automatically on generated release pull requests. The app credential is only
for GitHub release-PR automation; npm authentication remains OIDC-only.

The manual bootstrap uses the maintainer's interactive npm authentication. No
long-lived npm credential is added to GitHub.

## Failure Behavior

- Invalid local commit messages fail at `commit-msg`.
- Local lint or type errors fail at `pre-commit`.
- Bypassed hooks are caught by required CI checks.
- A missing normal or empty Changeset fails the policy job.
- Any Node matrix failure blocks merging.
- Release pull-request creation fails visibly if GitHub Actions cannot create
  pull requests or the release GitHub App is not configured.
- Publishing fails without a valid npm trusted-publisher relationship and never
  falls back to `NPM_TOKEN` or `NODE_AUTH_TOKEN`.
- A versioning failure leaves changes confined to the release pull request. If
  publishing fails after that pull request is merged, the version commit remains
  on `main` and the publish job can be rerun without creating another bump.

## Verification

Implementation will use test-driven checks for the custom Changeset policy and
static repository contracts. Verification will include:

- valid and invalid Conventional Commit fixtures;
- normal, empty, missing, and generated-release Changeset cases;
- direct execution of both Husky hook commands without creating a commit;
- package metadata and Changesets configuration assertions;
- workflow structure and permission assertions;
- `npm run check` on the supported local environment;
- `npm run build` and `npm pack --dry-run`; and
- inspection of GitHub visibility, merge settings, branch protection, and CI
  results after the implementation branch is pushed.

The implementation will not publish a package. It will prepare and verify the
workflow, then leave the documented npm bootstrap and first publication as an
explicit operator action.

## Documentation

`CONTRIBUTING.md` will document Conventional Commit examples, local hooks,
normal and empty Changesets, and the checks contributors should run.
`docs/releasing.md` will document Changesets release behavior, repository
settings, hosted Changeset Bot installation, release GitHub App setup, OIDC
bootstrap, provenance, and failure recovery. No README changes are part of this
scope.

## Authoritative References

- [Changesets configuration](https://github.com/changesets/changesets/blob/main/docs/config-file-options.md)
- [Changesets GitHub Action v2](https://github.com/changesets/action/tree/v2.1.2)
- [Changeset Bot GitHub App](https://github.com/apps/changeset-bot)
- [GitHub token workflow-trigger behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Commitlint local setup](https://commitlint.js.org/guides/local-setup)
- [Commitlint CI setup](https://commitlint.js.org/guides/ci-setup)
- [Husky setup](https://typicode.github.io/husky/get-started.html)
- [GitHub dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)

## Non-Goals

- README updates;
- prerelease channels or snapshot releases;
- multi-package workspace release rules;
- automatic npm token fallback;
- semantic-release or a second versioning system;
- requiring a minimum number of approving reviews; or
- performing the first npm publication during implementation.
