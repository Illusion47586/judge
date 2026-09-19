# Repository-wide pnpm Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pnpm 12.4.2 Judge's reproducible package manager and command runner everywhere except the final npm OIDC registry upload.

**Architecture:** `package.json` pins pnpm and `pnpm-lock.yaml` becomes the only dependency lockfile. Local scripts, hooks, tests, CI, and Changesets orchestration run through pnpm; the release script delegates only the registry upload to `npm publish --ignore-scripts`, then reports tags through the Changesets CLI.

**Tech Stack:** Node.js 22.18.0 and 24, pnpm 12.4.2, TypeScript 7, Node test runner, Husky 9, Commitlint 21, Changesets CLI 3, Changesets Action 2, GitHub Actions.

## Global Constraints

- Pin exactly `pnpm@12.4.2` in `package.json`.
- Keep `pnpm-lock.yaml`; remove and reject `package-lock.json`.
- Keep `pnpm-workspace.yaml` configuration-only, with no `packages` field and
  only exact version-specific minimum-release-age exceptions.
- Use pnpm for installs, project scripts, hooks, tests, examples, packaging, CI, and release orchestration.
- Allow npm only for the final `npm publish --ignore-scripts` OIDC registry transport.
- Keep Node.js support at `>=22.18.0`; CI covers Node 22.18.0 and Node 24.
- Preserve exact-hit `node_modules` caches in quality CI, keyed by OS, architecture, Node version, and `pnpm-lock.yaml`.
- Use fresh, uncached, frozen pnpm installs in release jobs.
- Never add `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or another npm publication credential.
- Do not publish a package while executing this plan.
- Do not modify any README file, including `examples/README.md`.
- Preserve unrelated user changes and do not rewrite completed historical plans.

---

### Task 1: Establish the pnpm package-manager contract

**Files:**
- Create: `test/package-manager.test.ts`
- Create: `pnpm-lock.yaml` through pnpm
- Create: `pnpm-workspace.yaml` through pnpm with exact release-age exceptions
- Modify: `package.json`
- Modify: `.husky/pre-commit`
- Modify: `.husky/commit-msg`
- Modify: `scripts/check-changeset.ts`
- Modify: `test/release-config.test.ts`
- Modify: `test/package-isolation.test.ts`
- Modify: `test/package-exports.test.ts`
- Modify: `test/jsdoc.test.ts`
- Delete: `package-lock.json`

**Interfaces:**
- Consumes: existing package scripts, Husky hooks, Changesets configuration, and package contract tests.
- Produces: exact `packageManager: "pnpm@12.4.2"`, `pnpm-lock.yaml`, pnpm-only project commands, and release script `pnpm build && npm publish --ignore-scripts && pnpm exec changeset git-tag`.

- [ ] **Step 1: Write the failing package-manager contract test**

Create `test/package-manager.test.ts`:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

const repositoryCommandFiles = [
  ".husky/pre-commit",
  ".husky/commit-msg",
  "scripts/check-changeset.ts",
];

test("repository pins pnpm and has one lockfile", () => {
  const packageJson = readJson("package.json");

  assert.equal(packageJson.packageManager, "pnpm@12.4.2");
  assert.equal(existsSync("pnpm-lock.yaml"), true);
  assert.equal(existsSync("package-lock.json"), false);
});

test("pnpm safety exceptions are exact and do not add workspace packages", () => {
  const workspace = readFileSync("pnpm-workspace.yaml", "utf8");

  assert.doesNotMatch(workspace, /^packages:/mu);
  assert.match(workspace, /@ai-sdk\/gateway@4\.0\.87/u);
  assert.match(workspace, /@ai-sdk\/provider-utils@5\.0\.45/u);
  assert.match(workspace, /ai@7\.0\.107/u);
});

test("package scripts use pnpm except for the OIDC upload", () => {
  const packageJson = readJson("package.json");
  const scripts = packageJson.scripts as Record<string, string>;

  assert.equal(
    scripts.release,
    "pnpm build && npm publish --ignore-scripts && pnpm exec changeset git-tag"
  );

  for (const [name, command] of Object.entries(scripts)) {
    if (name === "release") {
      continue;
    }
    assert.doesNotMatch(command, /\b(?:npm|npx)\b/u, `${name}: ${command}`);
  }
});

test("hooks and repository scripts have no npm runner commands", () => {
  const forbidden = /\b(?:npm|npx)\s+(?:ci|exec|install|pack|run|test)\b/u;

  for (const file of repositoryCommandFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), forbidden, file);
  }
});
```

- [ ] **Step 2: Run the focused tests red**

Run:

```bash
node --test test/package-manager.test.ts test/release-config.test.ts
```

Expected: FAIL because `packageManager` and `pnpm-lock.yaml` are absent, `package-lock.json` exists, and the current scripts and hooks use npm.

- [ ] **Step 3: Pin pnpm and migrate package scripts**

Add the top-level field to `package.json`:

```json
"packageManager": "pnpm@12.4.2"
```

Replace the affected scripts with these exact values while preserving all other metadata and dependencies:

```json
{
  "scripts": {
    "build": "pnpm clean && tsc -p tsconfig.build.json",
    "changeset": "changeset",
    "changeset:status": "changeset status",
    "check": "pnpm lint && pnpm typecheck && pnpm typecheck:contracts && pnpm typecheck:examples && pnpm test:unit",
    "clean": "node --eval \"import fs from 'node:fs'; fs.rmSync('dist', { recursive: true, force: true })\"",
    "commitlint": "commitlint",
    "example:agent": "pnpm --silent build && node --env-file=.env examples/09-agent-tool-routing.ts",
    "example:all": "pnpm --silent build && node scripts/run-examples.ts",
    "example:boolean": "pnpm --silent build && node --env-file=.env examples/01-boolean.ts",
    "example:choice": "pnpm --silent build && node --env-file=.env examples/03-choice.ts",
    "example:if": "pnpm --silent build && node --env-file=.env examples/02-if.ts",
    "example:incident": "pnpm --silent build && node --env-file=.env examples/08-incident-escalation.ts",
    "example:risk": "pnpm --silent build && node --env-file=.env examples/07-transaction-risk.ts",
    "example:score": "pnpm --silent build && node --env-file=.env examples/05-score.ts",
    "example:support": "pnpm --silent build && node --env-file=.env examples/06-support-triage.ts",
    "example:switch": "pnpm --silent build && node --env-file=.env examples/04-switch.ts",
    "fix": "ultracite fix",
    "lint": "ultracite check",
    "prepack": "pnpm build",
    "prepare": "node .husky/install.mjs",
    "release": "pnpm build && npm publish --ignore-scripts && pnpm exec changeset git-tag",
    "test": "node --test --test-concurrency=1",
    "test:coverage": "node --test --test-concurrency=1 --experimental-test-coverage",
    "test:unit": "node --test --test-concurrency=1",
    "test:watch": "node --test --watch",
    "typecheck": "tsc --noEmit",
    "typecheck:contracts": "pnpm --silent build && tsc --noEmit -p tsconfig.type-contracts.json",
    "typecheck:examples": "pnpm --silent build && tsc --noEmit -p tsconfig.examples.json",
    "version-packages": "changeset version"
  }
}
```

- [ ] **Step 4: Generate the pnpm lockfile and remove the npm lockfile**

Run:

```bash
pnpm install --lockfile-only
```

Confirm the command resolves pnpm 12.4.2 from `packageManager`. Then remove only the repository file `package-lock.json` with `apply_patch` and verify:

```bash
pnpm --version
test -f pnpm-lock.yaml
test ! -e package-lock.json
```

Expected: version is `12.4.2`, `pnpm-lock.yaml` exists, and `package-lock.json` is absent.

Retain the generated `pnpm-workspace.yaml` only with these exact entries and no
`packages` field:

```yaml
minimumReleaseAgeExclude:
  - "@ai-sdk/gateway@4.0.87"
  - "@ai-sdk/provider-utils@5.0.45"
  - "ai@7.0.107"
```

- [ ] **Step 5: Migrate hooks, diagnostics, and subprocess tests**

Set `.husky/pre-commit` to:

```sh
pnpm lint && pnpm typecheck
```

Set `.husky/commit-msg` to:

```sh
pnpm commitlint --edit "$1"
```

Change the Changeset error message in `scripts/check-changeset.ts` to:

```ts
"Every pull request must add a valid normal or empty Changeset. Run `pnpm changeset` or `pnpm changeset --empty`."
```

In `test/package-isolation.test.ts`, `test/package-exports.test.ts`, and `test/jsdoc.test.ts`, replace each build subprocess with:

```ts
execFileSync("pnpm", ["build"], {
  cwd: process.cwd(),
  stdio: "pipe",
});
```

In `test/release-config.test.ts`:

- run Commitlint with `spawnSync("pnpm", ["commitlint", "--verbose"], ...)`;
- expect the exact pnpm release script from Step 3;
- expect `pnpm lint && pnpm typecheck\n` and `pnpm commitlint --edit "$1"\n`;
- copy `pnpm-lock.yaml` instead of `package-lock.json` into the production fixture;
- run `pnpm install --prod --frozen-lockfile` with `NODE_ENV=production`;
- run package inspection with `pnpm pack --dry-run --json`.

Keep the existing safe-environment filtering and assertions that Husky is absent and `LICENSE` is packed.

- [ ] **Step 6: Install from the frozen lockfile and run focused tests green**

Run:

```bash
pnpm install --frozen-lockfile
node --test test/package-manager.test.ts test/release-config.test.ts test/package-isolation.test.ts test/package-exports.test.ts test/jsdoc.test.ts
pnpm lint
pnpm typecheck
```

Expected: all focused tests, lint, and typecheck pass. No package is published.

- [ ] **Step 7: Commit the package-manager contract**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml package-lock.json .husky/pre-commit .husky/commit-msg scripts/check-changeset.ts test/package-manager.test.ts test/release-config.test.ts test/package-isolation.test.ts test/package-exports.test.ts test/jsdoc.test.ts
git commit -m "build: migrate package management to pnpm"
```

Expected: the pnpm-based hooks pass and the commit records the lockfile replacement.

---

### Task 2: Migrate cached quality CI to pnpm

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `test/ci-workflow.test.ts`

**Interfaces:**
- Consumes: Task 1's exact `packageManager` pin and `pnpm-lock.yaml`.
- Produces: pnpm setup, frozen installs, pnpm commands, and exact `node_modules` caches for policy and Node matrix jobs.

Task 2 also extends `test/package-manager.test.ts` so its maintained-command
scan includes every file in `.github/workflows` after those workflows migrate.

- [ ] **Step 1: Rewrite the CI contract test to require pnpm**

Replace the npm-specific constants and assertions in `test/ci-workflow.test.ts` with:

```ts
const SAFE_COMMITLINT =
  /run: pnpm commitlint --from "\$BASE_SHA" --to "\$HEAD_SHA" --verbose/u;
const PNPM_SETUP = /uses: pnpm\/action-setup@v6/u;
```

In the primary CI test, assert:

```ts
assert.match(workflow, PNPM_SETUP);
assert.ok(workflow.includes('node: ["22.18.0", "24"]'));
assert.ok(workflow.includes("pnpm install --frozen-lockfile"));
assert.ok(workflow.includes("pnpm check"));
assert.ok(workflow.includes("pnpm build"));
assert.ok(workflow.includes("pnpm pack --dry-run"));
```

In the cache test, assert:

```ts
assert.ok(workflow.includes("path: node_modules"));
assert.ok(workflow.includes("hashFiles('pnpm-lock.yaml')"));
assert.ok(!workflow.includes("restore-keys:"));
assert.ok(workflow.includes("cache-hit != 'true'"));
assert.doesNotMatch(workflow, /\bnpm\s+(?:ci|run|pack)\b/u);
```

- [ ] **Step 2: Run the CI contract red**

Run:

```bash
node --test test/ci-workflow.test.ts test/package-manager.test.ts
```

Expected: FAIL because `.github/workflows/ci.yml` still installs and runs with npm and hashes `package-lock.json`.

- [ ] **Step 3: Migrate both CI jobs**

In every job, add pnpm setup after checkout and before project commands:

```yaml
- uses: pnpm/action-setup@v6
```

Keep `actions/setup-node@v6` with `package-manager-cache: false`. Change each cache key from `hashFiles('package-lock.json')` to `hashFiles('pnpm-lock.yaml')`.

Use these commands:

```yaml
- name: Install dependencies
  if: steps.node-modules.outputs.cache-hit != 'true'
  run: pnpm install --frozen-lockfile
```

Policy commands:

```yaml
run: pnpm commitlint --from "$BASE_SHA" --to "$HEAD_SHA" --verbose
```

```yaml
run: pnpm commitlint --last --verbose
```

```yaml
run: printf '%s\n' "$PR_TITLE" | pnpm commitlint --verbose
```

Keep the Changeset checker as the direct Node command because it is a repository script, not a package-manager operation. Test matrix commands become:

```yaml
- run: pnpm check
- run: pnpm build
- run: pnpm pack --dry-run
```

- [ ] **Step 4: Verify cached CI contracts and local quality gates**

Run:

```bash
node --test test/ci-workflow.test.ts test/package-manager.test.ts
pnpm lint
pnpm typecheck
pnpm check
```

Expected: CI contracts and all quality gates pass; workflow shell commands contain no npm runner usage.

- [ ] **Step 5: Commit pnpm CI**

```bash
git add .github/workflows/ci.yml test/ci-workflow.test.ts
git commit -m "ci: run cached quality gates with pnpm"
```

Expected: commit succeeds through pnpm-based local hooks.

---

### Task 3: Add pnpm-orchestrated OIDC release automation

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `test/release-workflow.test.ts`
- Create: `CONTRIBUTING.md`
- Create: `docs/releasing.md`
- Modify: `docs/superpowers/specs/2026-09-19-release-and-commit-governance-design.md`
- Modify: `docs/superpowers/plans/2026-09-19-release-and-commit-governance.md`

**Interfaces:**
- Consumes: Task 1's `version-packages` and `release` scripts and Task 2's pnpm CI conventions.
- Produces: least-privilege Changesets v2 release jobs, npm OIDC upload through the one approved exception, and pnpm contributor/operator instructions.

- [ ] **Step 1: Write the failing release workflow contract test**

Create `test/release-workflow.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/release.yml", "utf8");

test("release workflow separates selection, versioning, and publishing", () => {
  assert.match(workflow, /changesets\/action\/select-mode@v2\.1\.2/u);
  assert.match(workflow, /changesets\/action\/version@v2\.1\.2/u);
  assert.match(workflow, /changesets\/action\/publish@v2\.1\.2/u);
  assert.match(workflow, /actions\/create-github-app-token@v3\.2\.0/u);
  assert.match(workflow, /RELEASE_APP_CLIENT_ID/u);
  assert.match(workflow, /RELEASE_APP_PRIVATE_KEY/u);
  assert.match(
    workflow,
    /github-token: \$\{\{ steps\.app-token\.outputs\.token \}\}/u
  );
  assert.match(workflow, /script: pnpm version-packages/u);
  assert.match(workflow, /script: pnpm release/u);
});

test("every release job sets up pinned pnpm and installs fresh", () => {
  assert.equal(workflow.match(/uses: pnpm\/action-setup@v6/gu)?.length, 3);
  assert.equal(
    workflow.match(/run: pnpm install --frozen-lockfile/gu)?.length,
    3
  );
  assert.doesNotMatch(workflow, /actions\/cache/u);
  assert.doesNotMatch(workflow, /restore-keys:/u);
});

test("publishing is OIDC-only and fails closed", () => {
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /registry-url: "https:\/\/registry\.npmjs\.org"/u);
  assert.match(workflow, /package-manager-cache: false/u);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/u);
  assert.doesNotMatch(workflow, /\bnpm\s+(?:ci|install|run|pack|test)\b/u);
});
```

- [ ] **Step 2: Run the release workflow test red**

Run:

```bash
node --test test/release-workflow.test.ts
```

Expected: FAIL because `.github/workflows/release.yml` does not exist.

- [ ] **Step 3: Create the least-privilege release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches:
      - main

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

permissions: {}

jobs:
  select-mode:
    name: Select release mode
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    outputs:
      mode: ${{ steps.select-mode.outputs.mode }}
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Select release mode
        id: select-mode
        uses: changesets/action/select-mode@v2.1.2

  version:
    name: Version package
    if: needs.select-mode.outputs.mode == 'version'
    needs: select-mode
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Mint release app token
        id: app-token
        uses: actions/create-github-app-token@v3.2.0
        with:
          client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}
          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}
          repositories: judge
          permission-contents: write
          permission-pull-requests: write
      - name: Create or update release pull request
        uses: changesets/action/version@v2.1.2
        with:
          github-token: ${{ steps.app-token.outputs.token }}
          script: pnpm version-packages
          commit-message: "chore(release): version package"
          pr-title: "chore(release): version package"

  publish:
    name: Publish package
    if: needs.select-mode.outputs.mode == 'publish'
    needs: select-mode
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false
      - run: pnpm install --frozen-lockfile
      - name: Publish with npm trusted publishing
        uses: changesets/action/publish@v2.1.2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: pnpm release
          create-github-releases: true
          push-git-tags: true
```

Do not run this workflow locally and do not invoke `pnpm release` during implementation.

- [ ] **Step 4: Add pnpm contributor guidance without touching README files**

Create `CONTRIBUTING.md` with:

```md
# Contributing

## Install

Install the pnpm version pinned in `package.json`, then run
`pnpm install --frozen-lockfile`. The `prepare` lifecycle installs the
repository's Husky hooks during local development.

## Before committing

The pre-commit hook runs `pnpm lint` and `pnpm typecheck`. Run `pnpm check`
before opening a pull request to include tests and contract checks.

## Conventional Commits

Every commit and pull-request title must follow Conventional Commits. Examples:

- `feat: add a gateway adapter`
- `fix(core): preserve cancellation errors`
- `docs: explain context budgets`
- `chore!: remove a deprecated export`

The `commit-msg` hook validates local commits. CI validates every pull-request
commit and the pull-request title.

The hosted Changeset Bot may also comment with a shortcut for adding a
Changeset. Its comments are advisory; CI is authoritative.

## Changesets

Every pull request must include an explicit release decision.

- Run `pnpm changeset` for a user-visible change and select the SemVer bump.
- Run `pnpm changeset --empty` for documentation, tests, CI, or another change
  that should not release the package.

Commit the generated `.changeset/*.md` file with the pull request.
```

- [ ] **Step 5: Add pnpm release operator guidance without touching README files**

Create `docs/releasing.md`:

```md
# Releasing Judge

## Automated flow

Merges to `main` accumulate Changesets. The Release workflow creates or updates
`chore(release): version package`. Merging that pull request publishes the
version to the npm registry, creates the Git tag, and creates the GitHub release.

Release jobs run fresh `pnpm install --frozen-lockfile` installs without a
dependency cache. pnpm runs every project command. The release script uses npm
only for its internal `npm publish --ignore-scripts` OIDC registry upload.

## GitHub automation apps

Install the hosted Changeset Bot on `Illusion47586/judge` for advisory pull
request feedback.

Create a repository-owned GitHub App for release pull requests with only:

- Repository contents: read and write
- Pull requests: read and write

Install it only on `Illusion47586/judge`. Store its client ID as the repository
variable `RELEASE_APP_CLIENT_ID` and its private key as the repository secret
`RELEASE_APP_PRIVATE_KEY`. The Release workflow mints a short-lived installation
token for the Changesets version action. Do not use a personal access token or
the built-in `GITHUB_TOKEN` for release pull requests.

## One-time npm OIDC bootstrap

1. Create or verify the `brkn-labs` organization on npm and publishing access
   for `@brkn-labs/judge`.
2. From a clean checkout of `main`, run `pnpm check`, `pnpm build`, and
   `pnpm pack --dry-run`, then manually publish public version `0.0.0` using the
   maintainer's interactive npm authentication.
3. Open the npm package settings and add a GitHub Actions trusted publisher:
   - owner: `Illusion47586`
   - repository: `judge`
   - workflow filename: `release.yml`
4. Verify the release GitHub App variable and secret are configured.
5. Merge the generated release pull request to publish `0.1.0` through OIDC.

Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN`. If trusted publishing is not ready,
the publish job must fail closed.

## Recovery

If versioning fails, verify the release GitHub App installation, client ID,
private key, and repository permissions before rerunning the workflow. If
publishing fails after the release pull request merged, correct the npm trusted
publisher and rerun the failed publish job; do not create another version bump.

If `npm publish --ignore-scripts` succeeds but tag creation fails, verify that
the version exists on the npm registry, create or repair the matching Git tag,
and rerun only after reconciling the release state.
```

- [ ] **Step 6: Align the active release design and remaining plan steps**

In `docs/superpowers/specs/2026-09-19-release-and-commit-governance-design.md`, update executable install, check, build, pack, hook, and release commands to pnpm. Preserve npm-registry terminology and state explicitly that the final OIDC transport is `npm publish --ignore-scripts`.

Use these exact command transformations in still-current guidance:

```text
npm ci                              -> pnpm install --frozen-lockfile
npm run <script>                    -> pnpm <script>
npm pack --dry-run                  -> pnpm pack --dry-run
npx ultracite doctor                -> pnpm exec ultracite doctor
npm run lint && npm run typecheck   -> pnpm lint && pnpm typecheck
```

Replace the release command description with:

```md
Release jobs run a fresh `pnpm install --frozen-lockfile` and restore no
dependency cache. pnpm runs all project commands. The final registry transport
is the sole exception: `npm publish --ignore-scripts` uses npm trusted
publishing, after which `pnpm exec changeset git-tag` reports release metadata
to the Changesets v2 publish action.
```

In `docs/superpowers/plans/2026-09-19-release-and-commit-governance.md`:

- add a top-level note that the pnpm migration plan supersedes npm commands in
  unexecuted tasks;
- update Task 4 and later verification commands to pnpm;
- update the release workflow examples to the exact workflow in Step 3; and
- leave already-completed Task 1 through Task 3 command history intact.

Use this exact top-level note:

```md
> **pnpm amendment (2026-09-19):** The approved repository-wide pnpm migration
> supersedes npm commands in every unexecuted task. Use pnpm 12.4.2 and
> `pnpm-lock.yaml`; npm is permitted only for the final
> `npm publish --ignore-scripts` OIDC registry upload. Completed Task 1 through
> Task 3 command transcripts remain historical records.
```

Do not edit earlier completed plans or any README file.

- [ ] **Step 7: Verify release contracts and documentation**

Run:

```bash
node --test test/release-workflow.test.ts test/package-manager.test.ts
rg -n 'NPM_TOKEN|NODE_AUTH_TOKEN' .github && exit 1 || true
git diff --name-only main...HEAD | rg '(^|/)README(\.|$)' && exit 1 || true
pnpm check
pnpm build
pnpm pack --dry-run
```

Expected: release and package-manager contracts pass, no workflow contains a publication token, no README is changed, and the full package gates pass without publishing.

- [ ] **Step 8: Commit release automation and documentation**

```bash
git add .github/workflows/release.yml test/release-workflow.test.ts CONTRIBUTING.md docs/releasing.md docs/superpowers/specs/2026-09-19-release-and-commit-governance-design.md docs/superpowers/plans/2026-09-19-release-and-commit-governance.md
git commit -m "ci: automate pnpm-orchestrated oidc releases"
```

Expected: commit succeeds through pnpm-based hooks.

---

### Task 4: Run the complete migration verification gate

**Files:**
- Modify only if a test exposes a pnpm migration defect; do not broaden scope.

**Interfaces:**
- Consumes: Tasks 1 through 3.
- Produces: evidence that pnpm is the sole project runner, package behavior is unchanged, and the release workflow is ready but unexecuted.

- [ ] **Step 1: Scan maintained executable files for forbidden npm runner usage**

Run:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!README*' --glob '!docs/superpowers/plans/**' '\b(?:npm|npx)\s+(?:ci|exec|install|pack|run|test)\b' package.json .github .husky scripts test CONTRIBUTING.md docs/releasing.md
```

Expected: no matches. The approved `npm publish --ignore-scripts` exception is intentionally outside this forbidden-command expression.

- [ ] **Step 2: Run all static and unit checks through pnpm**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm typecheck:contracts
pnpm typecheck:examples
pnpm test:unit
pnpm test:coverage
```

Expected: every command passes; coverage meets the repository's existing threshold behavior.

- [ ] **Step 3: Verify build, package contents, and Ultracite**

Run:

```bash
pnpm build
pnpm pack --dry-run --json
pnpm exec ultracite doctor
```

Expected: build passes, the package manifest contains the intended public files including `LICENSE`, and Ultracite reports a healthy configuration.

- [ ] **Step 4: Verify lockfile reproducibility in a clean temporary checkout**

Use a disposable Git worktree so the user's working tree and `node_modules` remain untouched:

```bash
verification_dir="$(mktemp -d)/judge-pnpm-verification"
git worktree add --detach "$verification_dir" HEAD
(
  cd "$verification_dir"
  pnpm install --frozen-lockfile
  pnpm check
  pnpm build
  pnpm pack --dry-run
)
git worktree remove "$verification_dir"
```

Expected: the clean frozen install and all checks pass. If a command fails, preserve its output, remove only this explicit disposable worktree, fix the scoped defect with a failing test, and rerun the gate.

- [ ] **Step 5: Confirm repository state and commit any test-driven repair**

Run:

```bash
git status --short
git diff --check
git diff --name-only main...HEAD | rg '(^|/)README(\.|$)' && exit 1 || true
git log --oneline --decorate -8
```

Expected: no README change, no whitespace errors, and no unexplained working-tree changes. If Task 4 required a scoped repair, commit only that repair with an appropriate Conventional Commit message; otherwise do not create an empty commit.

## Completion boundary

This plan ends when the pnpm migration, pnpm CI, release workflow, documentation,
and complete local verification are green. It must not publish the package,
merge the branch, push unreviewed changes, or alter GitHub repository settings.
Those external actions remain in the parent release-governance plan and require
their existing review gates.
