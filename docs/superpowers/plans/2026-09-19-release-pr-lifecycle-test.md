# Release PR Lifecycle Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make release configuration tests pass both before and after Changesets consumes the initial release file.

**Architecture:** Extract the lifecycle assertion into a small helper that reads a supplied package and changeset directory. Test the helper against temporary pre-release and versioned fixtures, then use it for the repository-level assertion.

**Tech Stack:** TypeScript, Node.js test runner, pnpm, Changesets

## Global Constraints

- Preserve the permanent Changesets configuration assertions.
- Require the seed changeset at version `0.0.0`.
- Require the seed changeset to be absent after versioning.
- Do not modify `README.md` or runtime package behavior.

---

### Task 1: Make the release test lifecycle-aware

**Files:**
- Modify: `test/release-config.test.ts`
- Create: `.changeset/<generated-empty-changeset>.md`

**Interfaces:**
- Consumes: `package.json` version and `.changeset/initial-public-release.md`
- Produces: `assertInitialReleaseLifecycle(root: string): void`

- [ ] **Step 1: Add failing fixture coverage**

Add temporary fixtures proving that version `0.0.0` requires a matching seed,
and a versioned package requires the seed to be absent.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test test/release-config.test.ts`

Expected: the versioned fixture fails because the current assertion reads the
seed unconditionally.

- [ ] **Step 3: Implement the lifecycle assertion**

Read `package.json` relative to the supplied root. At version `0.0.0`, assert
that the seed exists and matches `INITIAL_RELEASE`; otherwise assert that the
seed does not exist. Call the helper from the repository configuration test.

- [ ] **Step 4: Verify focused and full checks**

Run: `node --test test/release-config.test.ts`

Expected: PASS.

Run: `pnpm check`

Expected: all lint, type, contract, example, and unit checks pass.

- [ ] **Step 5: Record the CI-only fix and open a pull request**

Create an empty Changeset decision, commit with Conventional Commits, push the
branch, and open a pull request against `main`. Confirm required checks pass.
