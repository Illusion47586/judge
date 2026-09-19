# CI Policy, Package Compatibility, and Contributor Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unactionable post-merge commit linting, add contributor templates, make optional integrations and the root entrypoint work in StackBlitz, allow context-free decisions, and document Judge's end-to-end type safety.

**Architecture:** Keep preventative pull-request policy checks while removing the push-only squash-commit check. Preserve the modern ESM `exports` contract, add a legacy `main` fallback, and follow the Knex/Sequelize optional-driver pattern by keeping adapter SDKs in development metadata rather than runtime peers. Make context optional at the provider-neutral type boundary and normalize only missing Jev state to `null`.

**Tech Stack:** TypeScript 7, Node.js test runner, pnpm, GitHub Actions, GitHub issue forms, Commitlint, Changesets

## Global Constraints

- Remove only the `Validate landed commit` step; retain PR commit, PR title, Changeset, and Node matrix checks.
- Do not weaken Commitlint configuration or local Husky hooks.
- Keep the package ESM-only and retain every existing `exports` subpath.
- Remove `@ai-sdk/gateway`, `ai`, and `cloudflare` from `peerDependencies`; keep them in `devDependencies` and keep their optional `peerDependenciesMeta` entries.
- Set `main` exactly to `./dist/index.js`.
- Make context optional for provider `boolean`, `choice`, and `score` plus client `boolean`, `choice`, `score`, `if`, and `switch`.
- Jev maps only `undefined` context to `null`; explicit `null` and defined falsy values are preserved.
- Do not claim Vercel AI SDK or the Jev JavaScript SDK is untyped.
- Record a patch Changeset because package metadata and the public API change.

---

### Task 1: Remove landed-commit validation with regression coverage

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `test/ci-workflow.test.ts`

**Interfaces:**
- Consumes: the existing `policy` job.
- Produces: a workflow that never invokes `commitlint --last` and keeps all PR checks.

- [x] **Step 1: Write the failing workflow assertion**

Remove the landed command from the ordered list and add:

```ts
assert.ok(!policyJob.includes("commitlint --last"));
```

- [x] **Step 2: Verify the regression test fails**

Run: `node --test test/ci-workflow.test.ts`

Expected: FAIL because `.github/workflows/ci.yml` still contains `commitlint --last`.

- [x] **Step 3: Delete only the push-only workflow step**

Delete:

```yaml
      - name: Validate landed commit
        if: github.event_name == 'push'
        run: pnpm commitlint --last --verbose
```

- [x] **Step 4: Re-run the focused test**

Run: `node --test test/ci-workflow.test.ts`

Expected: PASS with three tests.

---

### Task 2: Add and lint GitHub community templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/01-bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/02-feature-request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Create: `test/community-templates.test.ts`

**Interfaces:**
- Consumes: GitHub issue-form schema and `CONTRIBUTING.md` policy.
- Produces: structured bug and feature intake, no blank issues, and one default PR checklist.

- [x] **Step 1: Write and run the missing-template test**

Test required IDs `description`, `reproduction`, `expected`, `environment`, `problem`, and `solution`; optional IDs `logs`, `alternatives`, and `additional-context`; exact `blank_issues_enabled: false`; and PR headings plus Changeset, Conventional Commit, and `pnpm check` prompts.

Run: `node --test test/community-templates.test.ts`

Expected before files exist: FAIL with `ENOENT`.

- [x] **Step 2: Create the approved issue forms and PR template**

Keep fields, headings, and copy exactly as encoded by `test/community-templates.test.ts`. Do not add labels, assignees, or projects.

- [x] **Step 3: Run the focused test**

Run: `node --test test/community-templates.test.ts`

Expected: PASS with three tests.

- [x] **Step 4: Make the test lint-clean without weakening assertions**

Move the two repeated regular expressions to module scope:

```ts
const REQUIRED_VALIDATION = /validations:\n {6}required: true/u;
const REQUIRED_TRUE = /required: true/u;
```

Use `REQUIRED_VALIDATION` and `REQUIRED_TRUE` in `assertForm`.

- [x] **Step 5: Verify the template slice**

Run: `pnpm exec ultracite check test/community-templates.test.ts && node --test test/community-templates.test.ts`

Expected: both commands pass.

---

### Task 3: Protect the published package manifest

**Files:**
- Modify: `test/package-exports.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `package.json`, the TypeScript build, and pnpm's dry-run pack manifest.
- Produces: an ESM package with a legacy root fallback and no installer-enforced adapter SDKs.

- [x] **Step 1: Add failing manifest assertions**

Add imports for `readFileSync`, then add:

```ts
interface PackageManifest {
  devDependencies: Record<string, string>;
  exports: Record<string, { import: string; types: string }>;
  main?: string;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional: boolean }>;
  types: string;
}

const OPTIONAL_INTEGRATIONS = [
  "@ai-sdk/gateway",
  "ai",
  "cloudflare",
] as const;

test("publishes optional integrations without required runtime peers", () => {
  const manifest = JSON.parse(
    readFileSync("package.json", "utf8")
  ) as PackageManifest;

  assert.equal(manifest.main, "./dist/index.js");
  assert.deepEqual(manifest.peerDependencies, undefined);
  for (const dependency of OPTIONAL_INTEGRATIONS) {
    assert.ok(manifest.devDependencies[dependency]);
    assert.deepEqual(manifest.peerDependenciesMeta[dependency], {
      optional: true,
    });
  }
});
```

Extend the build test to gather `manifest.main`, `manifest.types`, and all `import` and `types` values from `manifest.exports`, strip the leading `./`, and assert `readFileSync(target)` succeeds for every unique target.

- [x] **Step 2: Verify the manifest test fails for the intended reasons**

Run: `node --test test/package-exports.test.ts`

Expected: FAIL because `main` is absent and `peerDependencies` exists.

- [x] **Step 3: Apply the minimal manifest change**

Add at the package-manager-sorted manifest position:

```json
"main": "./dist/index.js",
```

Delete the complete `peerDependencies` object. Do not modify `devDependencies`, `peerDependenciesMeta`, `types`, `files`, or `exports`.

- [x] **Step 4: Verify build targets and packed contents**

Run:

```bash
node --test test/package-exports.test.ts
pnpm pack --dry-run --json
```

Expected: the test passes; the JSON file list contains `dist/index.js`, `dist/index.d.ts`, every exported subpath target, `package.json`, and `README.md`.

---

### Task 4: Make context optional without losing inference

**Files:**
- Modify: `test-d/public-contracts.test-d.ts`
- Modify: `test/provider/jev-provider.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/provider/jev/provider.ts`

**Interfaces:**
- Consumes: all public provider/client option types and Jev request serialization.
- Produces: context-free calls that retain literal output inference and Jev requests with `state: null`.

- [x] **Step 1: Add compile-time context-free contracts**

Remove `context: {}` from the existing `choice`, `if`, `switch`, and `score` contract examples and add:

```ts
const booleanDecision = judge.boolean({ condition: "Proceed?" });
export type BooleanWithoutContext = Expect<
  Equal<typeof booleanDecision, Promise<import("@brkn-labs/judge").BooleanDecision>>
>;
```

Keep all existing `ChoiceContract`, `IfContract`, `SwitchContract`, and `ScoreContract` expectations unchanged. Also omit context from the invalid empty choice and one-level score calls so tuple validation remains independently tested.

- [x] **Step 2: Add failing Jev serialization tests**

Add a table-driven test that calls Boolean, Choice, and Score without `context` and captures each gateway request. Use valid provider answers and assert every request contains `state: null`. Add another Boolean case for each of `false`, `0`, and `""`, asserting the exact value is retained as `state`.

- [x] **Step 3: Verify type and runtime failures**

Run:

```bash
pnpm typecheck:contracts
node --test test/provider/jev-provider.test.ts
```

Expected: the contract build fails because context is required; the provider test fails because omitted context currently reaches `serializeState(undefined)`.

- [x] **Step 4: Make context optional at the public boundary**

In `src/core/types.ts`, change all five declarations from:

```ts
context: S;
```

to:

```ts
context?: S | undefined;
```

These are `BooleanInput`, `ChoiceInput`, `ScoreInput`, `BooleanOptions`, and `JudgeSwitchOptions`. Update each JSDoc sentence to say the context is optional. Do not change generic ordering or decision return types.

- [x] **Step 5: Normalize only absent Jev state**

In `src/provider/jev/provider.ts`, add:

```ts
const serializeOptionalState = (context: unknown): unknown =>
  serializeState(context === undefined ? null : context);
```

Replace all three `serializeState(input.context)` calls with `serializeOptionalState(input.context)`.

- [x] **Step 6: Re-run the focused context checks**

Run:

```bash
pnpm typecheck:contracts
node --test test/provider/jev-provider.test.ts
```

Expected: both pass; literal choices, narrowed callbacks, and callback-result unions remain exact.

---

### Task 5: Document positioning, installation, and release impact

**Files:**
- Modify: `README.md`
- Modify: `.changeset/remove-post-merge-commitlint.md`

**Interfaces:**
- Consumes: the verified public types and package manifest.
- Produces: accurate comparison/install guidance and a patch release note.

- [x] **Step 1: Add the type-safety comparison**

Add this row to `How Judge differs`:

```markdown
| Type safety | Literal options and case keys flow through validated decisions, narrowed callbacks, and inferred callback-result unions | Typed structured outputs and tools; application-specific branches remain application control flow | Answer types are inferred from the supplied Jev questions; application branching is separate |
```

Add after the table:

```markdown
Judge's type safety continues across the decision boundary: request literals
define the legal result union, selected callbacks receive branch-narrowed
metadata, and `if()` or `switch()` returns the inferred awaited union of every
possible callback—including the uncertainty path. Vercel AI SDK and the Jev SDK
also provide strong types; Judge specializes those types around bounded control
flow.
```

- [x] **Step 2: Replace peer wording with manual integration guidance**

Replace “optional peers” with “optional integrations.” Keep the Vercel command installing both `ai` and `@ai-sdk/gateway`, keep the Cloudflare command installing `cloudflare`, and state that direct Jev, core, mock, custom, and OpenRouter usage requires no additional integration package.

- [x] **Step 3: Convert the empty Changeset to a patch Changeset**

Set `.changeset/remove-post-merge-commitlint.md` to:

```markdown
---
"@brkn-labs/judge": patch
---

Allow context-free decisions, improve legacy package resolution, and stop optional gateway integrations from being installed as peers.
```

- [x] **Step 4: Verify docs and release metadata**

Run:

```bash
pnpm changeset:status
pnpm exec ultracite check README.md .changeset/remove-post-merge-commitlint.md
```

Expected: the new Changeset requests a patch. The aggregate status may remain
minor while the existing initial-public-release Changeset is pending.

---

### Task 6: Run the full gate, commit, open the PR, and merge after CI

**Files:**
- Modify: `docs/superpowers/plans/2026-09-20-remove-post-merge-commitlint.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: one reviewed PR merged only after all required checks pass.

- [x] **Step 1: Run focused regression checks**

Run:

```bash
node --test test/ci-workflow.test.ts test/community-templates.test.ts test/package-exports.test.ts test/provider/jev-provider.test.ts
pnpm typecheck:contracts
```

Expected: all tests and compile-time contracts pass.

- [x] **Step 2: Run the complete local gate**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm check
pnpm build
pnpm pack --dry-run
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 3: Review the final diff and commit implementation**

Run `git diff --stat`, `git diff`, and `git status --short`. Confirm no unrelated files are included, then commit with a Conventional Commit message whose body lines stay within Commitlint limits.

- [ ] **Step 4: Push and open the pull request**

Push `ci/remove-post-merge-commitlint` and create a PR targeting the latest `main`. The PR description must summarize CI policy, templates, package compatibility, optional context, README positioning, Changeset impact, and the commands run.

- [ ] **Step 5: Wait for every required check and merge**

Monitor the PR until policy and both Node jobs complete. If any check fails, inspect its logs, fix the cause, rerun local verification, push, and wait again. Squash-merge only after all required checks pass, then verify the PR reports a merged state.
