# CI Policy, Package Compatibility, and Contributor Experience Design

## Goal

Prevent `main` CI from failing only after a pull request has already been
merged because of the generated squash commit message. The failure motivating
this change was Commitlint's `body-max-line-length` rule rejecting a squash
description after PR checks had passed.

As part of the same contribution-governance change, add structured issue forms
and a default pull-request template so contributors see the repository's intake
and validation expectations before submitting work.

Also refine the README's adjacent-SDK comparison with Judge's end-to-end typed
decision-control-flow advantage.

Finally, make the published package work in StackBlitz without requiring every
optional gateway SDK, restore compatibility with legacy package resolvers, and
allow callers to omit evaluation context when a decision needs no state.

## Design

Remove the `Validate landed commit` step from the CI policy job. Pushes to
`main` will continue to run the policy job setup and the full Node test matrix,
but will not run `pnpm commitlint --last --verbose`.

Pull requests retain all existing preventative checks:

- every branch commit between the base and head SHA is validated by Commitlint;
- the pull-request title is validated by Commitlint;
- every pull request must include a valid normal or empty Changeset;
- the full checks, build, and package dry run execute on both supported Node
  versions.

This deliberately removes the entire post-merge commit-message check rather
than weakening a single Commitlint rule globally. Local commits and PR commits
therefore keep the conventional configuration, including body formatting
rules, while GitHub-generated squash messages cannot create an unactionable
failure after merge.

## Community templates

Create two ordered YAML issue forms under `.github/ISSUE_TEMPLATE`:

- `01-bug-report.yml` requires a problem description, reproduction steps,
  expected behavior, and environment details; logs and additional context are
  optional.
- `02-feature-request.yml` requires the problem or use case and a proposed
  solution; alternatives and additional context are optional.

Neither form assigns labels, projects, or maintainers because the repository
does not establish those values. A sibling `config.yml` disables blank issues
for contributors so new reports use one of the structured forms.

Create `.github/pull_request_template.md` as the repository's single default PR
template. It prompts for a related issue, summary, motivation, concrete changes,
and verification. Its checklists cover the required Conventional Commit title,
`pnpm check`, documentation impact, and the mandatory normal-or-empty Changeset
decision described in `CONTRIBUTING.md`.

The paths and schema follow GitHub's documented issue-form and pull-request
template locations. A repository test will verify required top-level issue-form
keys and field IDs, the disabled blank-issue setting, and the PR template's
governance prompts without adding a runtime YAML dependency.

## README type-safety positioning

Add a `Type safety` row to the existing `How Judge differs` table. The comparison
must acknowledge that both adjacent SDKs provide strong types:

- Vercel AI SDK supports schema-validated typed outputs and type-safe tools.
- TypeSafe AI's Jev JavaScript SDK infers answer types from supplied questions.

Judge's narrower advantage is that types continue across the decision boundary:
literal option or case keys form the legal choice union, the selected callback
receives branch-narrowed decision metadata, and `if()` or `switch()` returns the
inferred awaited union of all possible callback results, including uncertainty.

A short paragraph after the table will explain that distinction without
claiming Vercel AI SDK or the Jev SDK is untyped. The claim is grounded in
Judge's public declaration contract and compile-time consumer tests, Vercel's
documented typed outputs and tools, and TypeSafe AI's documented inferred answer
types.

## Optional integrations and package resolution

Remove `@ai-sdk/gateway`, `ai`, and `cloudflare` from `peerDependencies`. Keep
them in `devDependencies` so Judge's adapters continue to build and test, and
retain their optional entries in `peerDependenciesMeta`, matching the manifest
pattern used by packages such as Knex and Sequelize for manually installed
integration drivers. This prevents StackBlitz and other installers from treating
all three mutually independent adapters as prerequisites for the core package.

The README will describe these packages as optional integrations rather than
optional peers. It will show the exact install command for each adapter and make
clear that the core, mock, custom, OpenRouter, and direct Jev entry points do not
require an additional integration package.

Add `"main": "./dist/index.js"` as a legacy root-entry fallback while retaining
the authoritative `exports` map and `types` declaration. The package remains
ESM-only through `"type": "module"`; no root shim and no parallel CommonJS build
will be introduced. This supports resolvers such as StackBlitz's legacy Turbo
resolver, which otherwise defaults to a nonexistent package-root `index.js`.

A package-manifest regression test will assert that runtime SDKs are absent from
`peerDependencies`, remain available to development, all retained peer metadata
is optional, and `main`, `types`, and every `exports` target resolve to files
included in the packed artifact.

## Optional context

Make `context` optional throughout the public decision surface:
`DecisionProvider.boolean`, `choice`, and `score`, plus `JudgeClient.boolean`,
`choice`, `score`, `if`, and `switch`. Supplying a context object continues to
preserve its inferred type and existing behavior.

When context is omitted, the core client passes `undefined` through the
provider-neutral interface. The Jev provider alone normalizes that absence to
`null` before serialization, so every Jev gateway request contains the valid
state value `null`. Explicit `null` remains `null`, and falsy but defined values
such as `false`, `0`, and the empty string must not be replaced. Other providers
remain free to interpret an omitted context according to their own contract.

Public compile-time tests will exercise context-free calls for all five client
methods while preserving literal choices, narrowed callbacks, and callback
return unions. Provider tests will assert that all three Jev operations send
`state: null` when context is omitted and that defined falsy contexts retain
their values.

## Files

- `.github/workflows/ci.yml`: remove the push-only landed-commit step.
- `.github/ISSUE_TEMPLATE/01-bug-report.yml`: structured bug intake.
- `.github/ISSUE_TEMPLATE/02-feature-request.yml`: structured feature intake.
- `.github/ISSUE_TEMPLATE/config.yml`: disable contributor blank issues.
- `.github/pull_request_template.md`: default PR guidance and checklist.
- `package.json`: remove runtime peer declarations and add the legacy root
  entrypoint fallback.
- `README.md`: add the end-to-end typed control-flow comparison and document
  manual installation for optional integrations.
- `src/core/types.ts`: make context optional across provider and client inputs.
- `src/provider/jev/provider.ts`: map omitted context to Jev state `null`.
- `test/ci-workflow.test.ts`: stop expecting the step and add an explicit
  regression assertion that `commitlint --last` is absent from the workflow.
- `test/community-templates.test.ts`: lock in the GitHub template paths and
  required contribution prompts.
- `test/package-exports.test.ts`: verify manifest compatibility and packed
  entrypoint targets.
- `test/provider/jev-provider.test.ts`: verify omitted and falsy context state.
- `test-d/public-contracts.test-d.ts`: verify context-free calls and preserved
  type inference.
- `.changeset/remove-post-merge-commitlint.md`: record a patch release for the
  compatible public API and packaging changes.

## Verification

The focused workflow test must fail before the workflow edit and pass after it.
The community-template test must fail before the templates exist and pass once
all four files satisfy the expected contract. README wording will be checked
against the public TypeScript contract and the existing consumer type tests.
Package tests must fail against the current peer and entrypoint metadata and pass
after the manifest change. Compile-time contracts and focused Jev provider tests
must fail before context becomes optional, then pass with omitted state mapped to
`null`. The final verification will run the focused tests, `pnpm lint`,
`pnpm typecheck`, `pnpm check`, `pnpm build`, and `pnpm pack --dry-run`. The pull
request must pass policy and both Node jobs before it is merged.
