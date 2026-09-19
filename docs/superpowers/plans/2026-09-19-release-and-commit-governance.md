# Release and Commit Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Judge a public Changesets-managed npm package with OIDC-only releases, strict Conventional Commits, required Changeset decisions, local Git hooks, cached CI, and enforced GitHub merge policy.

**Architecture:** Local Husky hooks provide fast feedback, while dependency-free policy code and GitHub Actions enforce the same rules authoritatively. CI and release automation are separate: CI restores exact `node_modules` caches with read-only permissions, while release jobs use fresh installs and Changesets v2 sub-actions with job-scoped write or OIDC permissions.

**Tech Stack:** Node.js 22.18 and 24, TypeScript 7, Node test runner, npm, Husky 9, Commitlint 21, Changesets CLI 3, Changesets Action 2, GitHub Actions.

## Global Constraints

- Do not create or modify any `README` file, including `.changeset/README.md`.
- Keep the package name `@brkn-labs/judge` and make it publicly publishable.
- Use npm OIDC trusted publishing only; never add `NPM_TOKEN` or `NODE_AUTH_TOKEN`.
- Use the hosted Changeset Bot only for advisory contributor feedback.
- Use a repository-owned, least-privilege GitHub App token for release pull requests.
- Every ordinary pull request needs a normal or explicit empty Changeset.
- Permit squash merges only and require Conventional Commit pull-request titles.
- Run full lint and typecheck in `pre-commit`; run Commitlint in `commit-msg`.
- Cache `node_modules` only in CI, keyed exactly by OS, architecture, Node version, and lockfile hash.
- Never restore dependency caches in release jobs.
- Do not publish the package during implementation; document and stop at the manual OIDC bootstrap boundary.
- Work only on `chore/release-infrastructure`, never directly on `main`.

---

### Task 1: Public package, Changesets, Commitlint, and Husky

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.changeset/config.json`
- Create: `.changeset/initial-public-release.md`
- Create: `commitlint.config.ts`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `test/release-config.test.ts`

**Interfaces:**
- Produces package scripts `changeset`, `changeset:status`, `commitlint`, `release`, and `version-packages`.
- Produces local hook commands used by contributors and package metadata consumed by Changesets and npm.

- [ ] **Step 1: Write the failing configuration contract test**

Create `test/release-config.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

test("package is public and exposes release commands", () => {
  const packageJson = readJson("package.json");
  const scripts = packageJson.scripts as Record<string, string>;
  const publishConfig = packageJson.publishConfig as Record<string, string>;
  const repository = packageJson.repository as Record<string, string>;

  assert.equal("private" in packageJson, false);
  assert.equal(publishConfig.access, "public");
  assert.equal(repository.type, "git");
  assert.equal(
    repository.url,
    "git+https://github.com/Illusion47586/judge.git"
  );
  assert.equal(packageJson.homepage, "https://github.com/Illusion47586/judge#readme");
  assert.deepEqual(packageJson.bugs, {
    url: "https://github.com/Illusion47586/judge/issues",
  });
  assert.equal(scripts.changeset, "changeset");
  assert.equal(scripts["changeset:status"], "changeset status");
  assert.equal(scripts.commitlint, "commitlint");
  assert.equal(scripts.prepare, "husky");
  assert.equal(scripts["version-packages"], "changeset version");
  assert.equal(scripts.release, "npm run build && changeset publish");
});

test("Changesets targets public main releases", () => {
  const config = readJson(".changeset/config.json");
  const initialChangeset = readFileSync(
    ".changeset/initial-public-release.md",
    "utf8"
  );

  assert.equal(config.baseBranch, "main");
  assert.equal(config.access, "public");
  assert.equal(config.commit, false);
  assert.equal(config.changelog, "@changesets/cli/changelog");
  assert.match(initialChangeset, /"@brkn-labs\/judge": minor/u);
});

test("local hooks enforce quality and Conventional Commits", () => {
  const preCommit = readFileSync(".husky/pre-commit", "utf8");
  const commitMessage = readFileSync(".husky/commit-msg", "utf8");
  const commitlint = readFileSync("commitlint.config.ts", "utf8");

  assert.equal(preCommit, "npm run lint && npm run typecheck\n");
  assert.equal(commitMessage, 'npm run commitlint -- --edit "$1"\n');
  assert.match(commitlint, /@commitlint\/config-conventional/u);
});
```

- [ ] **Step 2: Run the contract test red**

Run: `node --test test/release-config.test.ts`

Expected: FAIL because public metadata and release files do not exist.

- [ ] **Step 3: Install the exact governance dependencies**

Run:

```bash
npm install --save-dev @changesets/cli@^3.0.3 @commitlint/cli@^21.2.2 @commitlint/config-conventional@^21.2.2 husky@^9.1.7
```

Expected: `package.json` and `package-lock.json` update without audit errors that stop installation.

- [ ] **Step 4: Make the package public and add scripts**

Patch `package.json` so it has no `private` field and contains these exact additions while preserving existing fields and scripts:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Illusion47586/judge.git"
  },
  "homepage": "https://github.com/Illusion47586/judge#readme",
  "bugs": {
    "url": "https://github.com/Illusion47586/judge/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "changeset": "changeset",
    "changeset:status": "changeset status",
    "commitlint": "commitlint",
    "prepare": "husky",
    "release": "npm run build && changeset publish",
    "version-packages": "changeset version"
  }
}
```

Run: `npm install --package-lock-only`

Expected: lockfile root metadata matches `package.json`.

- [ ] **Step 5: Add Changesets configuration and the seed release**

Create `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@4.0.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Create `.changeset/initial-public-release.md`:

```md
---
"@brkn-labs/judge": minor
---

Add public release automation, Changesets, Conventional Commit enforcement,
and verified GitHub Actions workflows.
```

Do not run `changeset init`, because it would create a prohibited README file.

- [ ] **Step 6: Add Commitlint and Husky configuration**

Create `commitlint.config.ts`:

```ts
const config = {
  extends: ["@commitlint/config-conventional"],
};

export default config;
```

Create `.husky/pre-commit` with exactly:

```sh
npm run lint && npm run typecheck
```

Create `.husky/commit-msg` with exactly:

```sh
npm run commitlint -- --edit "$1"
```

Run: `chmod +x .husky/pre-commit .husky/commit-msg && npm run prepare`

Expected: Husky configures `.git/hooks` and both tracked hook files are executable.

- [ ] **Step 7: Verify configuration, hooks, and Commitlint behavior**

Run:

```bash
node --test test/release-config.test.ts
printf '%s\n' 'feat: add release automation' | npm run commitlint -- --verbose
if printf '%s\n' 'add release automation' | npm run commitlint -- --verbose; then exit 1; fi
.husky/pre-commit
npm run changeset:status
```

Expected: contract test passes; valid commit passes; invalid commit fails; hook commands pass; Changesets reports the planned minor release.

- [ ] **Step 8: Commit the package governance foundation**

```bash
git add package.json package-lock.json .changeset commitlint.config.ts .husky test/release-config.test.ts
git commit -m "chore: add release governance tooling"
```

Expected: commit succeeds through both Husky hooks.

---

### Task 2: Required Changeset decision policy

**Files:**
- Create: `scripts/check-changeset.ts`
- Create: `test/changeset-policy.test.ts`

**Interfaces:**
- Produces `hasChangesetDecision(lines: readonly string[]): boolean`.
- Produces `validateChangesetDecision(lines: readonly string[], headRef: string): void`.
- CLI consumes `<base-sha> <head-sha> <head-ref>` and exits non-zero when a normal pull request adds no Changeset.

- [ ] **Step 1: Write failing policy unit tests**

Create `test/changeset-policy.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  hasChangesetDecision,
  validateChangesetDecision,
} from "../scripts/check-changeset.ts";

const MISSING_CHANGESET = /normal or empty Changeset/u;

test("accepts normal and empty added Changeset files", () => {
  assert.equal(
    hasChangesetDecision(["A\t.changeset/bright-judges-smile.md"]),
    true
  );
  assert.equal(
    hasChangesetDecision(["A\t.changeset/quiet-docs-rest.md"]),
    true
  );
});

test("ignores config, README, modified, deleted, and nested files", () => {
  assert.equal(hasChangesetDecision(["A\t.changeset/config.json"]), false);
  assert.equal(hasChangesetDecision(["A\t.changeset/README.md"]), false);
  assert.equal(hasChangesetDecision(["M\t.changeset/existing.md"]), false);
  assert.equal(hasChangesetDecision(["D\t.changeset/existing.md"]), false);
  assert.equal(hasChangesetDecision(["A\t.changeset/nested/file.md"]), false);
});

test("rejects an ordinary pull request without a decision", () => {
  assert.throws(
    () => validateChangesetDecision(["M\tsrc/index.ts"], "feat/new-api"),
    MISSING_CHANGESET
  );
});

test("exempts only the generated main release branch", () => {
  assert.doesNotThrow(() =>
    validateChangesetDecision([], "changeset-release/main")
  );
  assert.throws(
    () => validateChangesetDecision([], "changeset-release/next"),
    MISSING_CHANGESET
  );
});
```

- [ ] **Step 2: Run the policy test red**

Run: `node --test test/changeset-policy.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/check-changeset.ts`.

- [ ] **Step 3: Implement the dependency-free policy and CLI**

Create `scripts/check-changeset.ts`:

```ts
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/u;
const RELEASE_BRANCH = "changeset-release/main";

export const hasChangesetDecision = (lines: readonly string[]): boolean =>
  lines.some((line) => {
    const [status, file] = line.split("\t");
    return status === "A" && file !== undefined && CHANGESET_FILE.test(file);
  });

export const validateChangesetDecision = (
  lines: readonly string[],
  headRef: string
): void => {
  if (headRef === RELEASE_BRANCH || hasChangesetDecision(lines)) {
    return;
  }
  throw new Error(
    "Every pull request must add a normal or empty Changeset. Run `npm run changeset` or `npm run changeset -- --empty`."
  );
};

const changedFiles = (baseSha: string, headSha: string): string[] => {
  const output = execFileSync(
    "git",
    ["diff", "--name-status", "--diff-filter=ADM", `${baseSha}...${headSha}`],
    { encoding: "utf8" }
  );
  return output.split("\n").filter(Boolean);
};

const main = (): void => {
  const [baseSha, headSha, headRef] = process.argv.slice(2);
  if (!(baseSha && headSha && headRef)) {
    throw new Error(
      "Usage: node scripts/check-changeset.ts <base-sha> <head-sha> <head-ref>"
    );
  }
  validateChangesetDecision(changedFiles(baseSha, headSha), headRef);
  process.stdout.write("Changeset decision found.\n");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 4: Run focused and repository checks**

Run:

```bash
node --test test/changeset-policy.test.ts
npm run lint
npm run typecheck
```

Expected: all tests and checks pass.

- [ ] **Step 5: Commit the policy**

```bash
git add scripts/check-changeset.ts test/changeset-policy.test.ts
git commit -m "ci: require explicit changeset decisions"
```

Expected: commit succeeds through local hooks.

---

### Task 3: Cached CI and workflow contracts

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `test/ci-workflow.test.ts`

**Interfaces:**
- Consumes the Task 1 Commitlint config and Task 2 policy CLI.
- Produces GitHub check names `Policy`, `Test (Node 22.18.0)`, and `Test (Node 24)` for branch protection.

- [ ] **Step 1: Write the failing CI contract test**

Create `test/ci-workflow.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

test("CI validates policy and both supported Node lines", () => {
  assert.match(workflow, /name: Policy/u);
  assert.match(workflow, /node: \["22\.18\.0", "24"\]/u);
  assert.match(workflow, /npm run check/u);
  assert.match(workflow, /npm run build/u);
  assert.match(workflow, /npm pack --dry-run/u);
  assert.match(workflow, /commitlint --from/u);
  assert.match(workflow, /commitlint --last/u);
  assert.match(workflow, /PR_TITLE/u);
  assert.match(workflow, /scripts\/check-changeset\.ts/u);
});

test("CI caches exact node_modules trees with read-only permissions", () => {
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.match(workflow, /path: node_modules/u);
  assert.match(workflow, /runner\.os/u);
  assert.match(workflow, /runner\.arch/u);
  assert.match(workflow, /matrix\.node/u);
  assert.match(workflow, /hashFiles\('package-lock\.json'\)/u);
  assert.doesNotMatch(workflow, /restore-keys:/u);
  assert.match(workflow, /cache-hit != 'true'/u);
});
```

- [ ] **Step 2: Run the CI contract test red**

Run: `node --test test/ci-workflow.test.ts`

Expected: FAIL because `.github/workflows/ci.yml` does not exist.

- [ ] **Step 3: Create the cached CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  policy:
    name: Policy
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          package-manager-cache: false
      - name: Cache node_modules
        id: node-modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: node-modules-${{ runner.os }}-${{ runner.arch }}-node-24-${{ hashFiles('package-lock.json') }}
      - name: Install dependencies
        if: steps.node-modules.outputs.cache-hit != 'true'
        run: npm ci
      - name: Validate pull request commits
        if: github.event_name == 'pull_request'
        run: npm run commitlint -- --from "${{ github.event.pull_request.base.sha }}" --to "${{ github.event.pull_request.head.sha }}" --verbose
      - name: Validate landed commit
        if: github.event_name == 'push'
        run: npm run commitlint -- --last --verbose
      - name: Validate pull request title
        if: github.event_name == 'pull_request'
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
        run: printf '%s\n' "$PR_TITLE" | npm run commitlint -- --verbose
      - name: Require a Changeset decision
        if: github.event_name == 'pull_request'
        run: node scripts/check-changeset.ts "${{ github.event.pull_request.base.sha }}" "${{ github.event.pull_request.head.sha }}" "${{ github.head_ref }}"

  test:
    name: Test (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        node: ["22.18.0", "24"]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ matrix.node }}
          package-manager-cache: false
      - name: Cache node_modules
        id: node-modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: node-modules-${{ runner.os }}-${{ runner.arch }}-node-${{ matrix.node }}-${{ hashFiles('package-lock.json') }}
      - name: Install dependencies
        if: steps.node-modules.outputs.cache-hit != 'true'
        run: npm ci
      - run: npm run check
      - run: npm run build
      - run: npm pack --dry-run
```

- [ ] **Step 4: Verify CI contracts and local package gates**

Run:

```bash
node --test test/ci-workflow.test.ts
npm run lint
npm run typecheck
npm run check
```

Expected: CI contracts and all repository checks pass locally.

- [ ] **Step 5: Commit CI**

```bash
git add .github/workflows/ci.yml test/ci-workflow.test.ts
git commit -m "ci: add cached quality gates"
```

Expected: commit succeeds through local hooks.

---

### Task 4: Least-privilege OIDC release automation and operator docs

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `CONTRIBUTING.md`
- Create: `docs/releasing.md`
- Create: `test/release-workflow.test.ts`

**Interfaces:**
- Consumes Task 1 scripts `version-packages` and `release`.
- Produces a conventional Changesets release pull request and OIDC-only npm publication workflow.

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
  assert.match(workflow, /github-token: \$\{\{ steps\.app-token\.outputs\.token \}\}/u);
  assert.match(workflow, /commit-message: "chore\(release\): version package"/u);
  assert.match(workflow, /pr-title: "chore\(release\): version package"/u);
  assert.match(workflow, /script: npm run version-packages/u);
  assert.match(workflow, /script: npm run release/u);
});

test("publishing uses fresh OIDC-only installs", () => {
  assert.match(workflow, /id-token: write/u);
  assert.match(workflow, /registry-url: "https:\/\/registry\.npmjs\.org"/u);
  assert.match(workflow, /package-manager-cache: false/u);
  assert.match(workflow, /npm ci/u);
  assert.doesNotMatch(workflow, /actions\/cache/u);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/u);
});
```

- [ ] **Step 2: Run the release workflow test red**

Run: `node --test test/release-workflow.test.ts`

Expected: FAIL because `.github/workflows/release.yml` does not exist.

- [ ] **Step 3: Create the release workflow**

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
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false
      - run: npm ci
      - run: npm run build
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
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false
      - run: npm ci
      - run: npm run build
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
          script: npm run version-packages
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
      - uses: actions/setup-node@v6
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"
          package-manager-cache: false
      - run: npm ci
      - name: Publish with npm trusted publishing
        uses: changesets/action/publish@v2.1.2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: npm run release
          create-github-releases: true
          push-git-tags: true
```

- [ ] **Step 4: Add contributor documentation without touching README files**

Create `CONTRIBUTING.md` with these sections and commands:

```md
# Contributing

## Install

Run `npm ci`. The `prepare` lifecycle installs the repository's Husky hooks.

## Before committing

The pre-commit hook runs `npm run lint` and `npm run typecheck`. Run
`npm run check` before opening a pull request to include tests and contract
checks.

## Conventional Commits

Every commit and pull-request title must follow Conventional Commits. Examples:

- `feat: add a gateway adapter`
- `fix(core): preserve cancellation errors`
- `docs: explain context budgets`
- `chore!: remove a deprecated export`

The `commit-msg` hook validates local commits. CI validates every pull-request
commit and the pull-request title.

The hosted Changeset Bot may also comment with a shortcut for adding a
Changeset. Its comments are advisory; the CI policy below is authoritative.

## Changesets

Every pull request must include an explicit release decision.

- Run `npm run changeset` for a user-visible change and select the SemVer bump.
- Run `npm run changeset -- --empty` for documentation, tests, CI, or another
  change that should not release the package.

Commit the generated `.changeset/*.md` file with the pull request.
```

- [ ] **Step 5: Add release operator documentation without touching README files**

Create `docs/releasing.md` covering these exact facts:

```md
# Releasing Judge

## Automated flow

Merges to `main` accumulate Changesets. The Release workflow creates or updates
`chore(release): version package`. Merging that pull request publishes the
version to npm, creates the Git tag, and creates the GitHub release.

Release jobs use fresh installs and npm trusted publishing. They do not use an
npm token or dependency cache.

## GitHub automation apps

Install the hosted Changeset Bot on `Illusion47586/judge` for advisory pull
request feedback.

Create a repository-owned GitHub App for release pull requests with only:

- Repository contents: read and write
- Pull requests: read and write

Install it only on `Illusion47586/judge`. Store its client ID as the repository
variable `RELEASE_APP_CLIENT_ID` and its private key as the repository secret
`RELEASE_APP_PRIVATE_KEY`. The Release workflow mints a short-lived installation
token and gives it to the Changesets version action. Do not use a personal access
token or the built-in `GITHUB_TOKEN` for release pull requests; those alternatives
either create a long-lived credential or require manual CI approval.

## One-time npm OIDC bootstrap

1. Create or verify the `brkn-labs` organization on npm and publishing access
   for `@brkn-labs/judge`.
2. From a clean checkout of `main`, run the full repository checks and manually
   publish public version `0.0.0` using the maintainer's interactive npm login.
3. Open the npm package settings and add a GitHub Actions trusted publisher with:
   - owner: `Illusion47586`
   - repository: `judge`
   - workflow filename: `release.yml`
4. Verify the release GitHub App variable and secret are configured.
5. Merge the generated release pull request to publish `0.1.0` through OIDC.

Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN`. If trusted publishing is not ready,
the publish job must fail closed.

## Recovery

If versioning fails, verify the release GitHub App installation, client ID,
private key, and two repository permissions before rerunning the workflow. If
publishing fails after the release pull request merged, correct the npm trusted
publisher and rerun the failed publish job; do not create another version bump.
```

- [ ] **Step 6: Verify release automation and docs**

Run:

```bash
node --test test/release-workflow.test.ts
rg -n 'NPM_TOKEN|NODE_AUTH_TOKEN' .github && exit 1 || true
git diff --name-only main...HEAD | rg '(^|/)README(\.|$)' && exit 1 || true
npm run check
npm run build
npm pack --dry-run
```

Expected: workflow contract and full gates pass; no token reference or README change exists; package dry-run contains only the allowed public files.

- [ ] **Step 7: Commit release automation and documentation**

```bash
git add .github/workflows/release.yml CONTRIBUTING.md docs/releasing.md test/release-workflow.test.ts
git commit -m "ci: automate oidc releases"
```

Expected: commit succeeds through local hooks.

---

### Task 5: Full verification, GitHub Apps, pull request, and repository policy

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-release-and-commit-governance.md`

**Interfaces:**
- Consumes the CI check names produced by Task 3.
- Produces a public, squash-only GitHub repository with both approved Apps,
  protected `main`, and an open implementation pull request.

- [ ] **Step 1: Run the complete local gate**

Run:

```bash
npm run check
npm run build
npm pack --dry-run
node --test test/package-isolation.test.ts test/package-exports.test.ts
git diff --check
git diff --name-only main...HEAD | rg '(^|/)README(\.|$)' && exit 1 || true
git status --short
```

Expected: every check passes, no README file differs, and the worktree is clean.

- [ ] **Step 2: Push the implementation branch and open the conventional pull request**

Run:

```bash
git push -u origin chore/release-infrastructure
gh pr create \
  --base main \
  --head chore/release-infrastructure \
  --title "ci: add release and commit governance" \
  --body "Adds Changesets, OIDC-only release automation, strict Conventional Commits, required Changeset decisions, Husky hooks, and cached Node 22.18/24 CI. No README files are changed."
```

Expected: GitHub returns the new pull-request URL.

- [ ] **Step 3: Observe real CI check names and results**

Run:

```bash
gh pr checks --watch
head_sha=$(gh pr view --json headRefOid --jq .headRefOid)
gh api "repos/Illusion47586/judge/commits/$head_sha/check-runs" --jq '.check_runs[] | [.name, .conclusion] | @tsv'
```

Expected: `Policy`, `Test (Node 22.18.0)`, and `Test (Node 24)` are present and successful. If GitHub renders different exact names, use the observed successful names in Step 5 rather than guessing.

- [ ] **Step 4: Make the repository public and squash-only**

Run:

```bash
gh repo edit Illusion47586/judge \
  --visibility public \
  --accept-visibility-change-consequences \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --enable-squash-merge=true
```

Expected: repository visibility changes to public and only squash merging remains enabled.

- [ ] **Step 5: Install the hosted Changeset Bot and configure the release App**

Using the authenticated GitHub browser session:

1. Open `https://github.com/apps/changeset-bot/installations/new` and install
   Changeset Bot for only `Illusion47586/judge`.
2. Open `https://github.com/settings/apps/new` and create
   `judge-release-illusion47586` with homepage
   `https://github.com/Illusion47586/judge`, webhooks disabled, repository
   Contents set to read/write, repository Pull requests set to read/write, and
   every other optional permission left at no access.
3. Install the new App only on `Illusion47586/judge`.
4. Generate one private key. Copy the App client ID into the repository Actions
   variable `RELEASE_APP_CLIENT_ID` through the repository Actions settings.
5. Store the downloaded private key without printing it, then move the local
   PEM to macOS Trash after GitHub accepts the secret:

```bash
release_key_file=$(find /Users/dhruvtiwari/Downloads -maxdepth 1 -type f -name 'judge-release-illusion47586*.private-key.pem' -print -quit)
test -n "$release_key_file"
gh secret set RELEASE_APP_PRIVATE_KEY --repo Illusion47586/judge < "$release_key_file"
mv "$release_key_file" /Users/dhruvtiwari/.Trash/
```

The Trash copy is recoverable until the user empties Trash. Never print or read
the PEM into terminal output.

Verify names only, never secret values:

```bash
gh variable list --repo Illusion47586/judge | rg '^RELEASE_APP_CLIENT_ID\b'
gh secret list --repo Illusion47586/judge | rg '^RELEASE_APP_PRIVATE_KEY\b'
```

Expected: both configuration names exist, Changeset Bot is installed only on
Judge, and the release App has exactly the two requested write permissions.

- [ ] **Step 6: Protect main with required PRs and observed CI checks**

After substituting the exact successful check names observed in Step 3, run:

```bash
gh api --method PUT repos/Illusion47586/judge/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Policy",
      "Test (Node 22.18.0)",
      "Test (Node 24)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON
```

Expected: direct pushes to `main` are blocked, pull requests are required with zero mandatory approvals, admins are subject to the rule, linear history is required, and all three CI contexts are required.

- [ ] **Step 7: Verify live repository policy**

Run:

```bash
gh api repos/Illusion47586/judge --jq '{visibility, allow_merge_commit, allow_rebase_merge, allow_squash_merge}'
gh api repos/Illusion47586/judge/branches/main/protection --jq '{required_status_checks, enforce_admins: .enforce_admins.enabled, required_pull_request_reviews, required_linear_history: .required_linear_history.enabled}'
gh variable list --repo Illusion47586/judge | rg '^RELEASE_APP_CLIENT_ID\b'
gh secret list --repo Illusion47586/judge | rg '^RELEASE_APP_PRIVATE_KEY\b'
gh pr view --json url,state,title,mergeable,mergeStateStatus,statusCheckRollup
```

Expected: visibility is `public`; merge and rebase are false; squash is true; branch protection matches Step 5; the implementation pull request is open and green.

- [ ] **Step 8: Record completion without changing README files**

Mark every completed checkbox in this plan, add a short verification note with the pull-request URL and observed check names, then run:

```bash
git add docs/superpowers/plans/2026-09-19-release-and-commit-governance.md
git commit -m "docs: complete release governance plan"
git push
gh pr checks --watch
git status --short --branch
```

Expected: the completion commit passes hooks, the branch is synchronized, and the pull request receives one final green CI run.

Do not merge the pull request and do not publish to npm in this task. The user must approve the implementation pull request and complete the documented npm bootstrap separately.
