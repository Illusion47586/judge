# CI Policy, Community Templates, and SDK Positioning Design

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

## Files

- `.github/workflows/ci.yml`: remove the push-only landed-commit step.
- `.github/ISSUE_TEMPLATE/01-bug-report.yml`: structured bug intake.
- `.github/ISSUE_TEMPLATE/02-feature-request.yml`: structured feature intake.
- `.github/ISSUE_TEMPLATE/config.yml`: disable contributor blank issues.
- `.github/pull_request_template.md`: default PR guidance and checklist.
- `README.md`: add the end-to-end typed control-flow comparison.
- `test/ci-workflow.test.ts`: stop expecting the step and add an explicit
  regression assertion that `commitlint --last` is absent from the workflow.
- `test/community-templates.test.ts`: lock in the GitHub template paths and
  required contribution prompts.
- `.changeset/remove-post-merge-commitlint.md`: record an empty Changeset
  because these repository-only changes do not require a package release.

## Verification

The focused workflow test must fail before the workflow edit and pass after it.
The community-template test must fail before the templates exist and pass once
all four files satisfy the expected contract. README wording will be checked
against the public TypeScript contract and the existing consumer type tests.
The final verification will run both focused tests, `pnpm lint`,
`pnpm typecheck`, and the full repository check. The pull request must pass
policy and both Node jobs before it is merged.
