# Remove Post-Merge Commitlint Design

## Goal

Prevent `main` CI from failing only after a pull request has already been
merged because of the generated squash commit message. The failure motivating
this change was Commitlint's `body-max-line-length` rule rejecting a squash
description after PR checks had passed.

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

## Files

- `.github/workflows/ci.yml`: remove the push-only landed-commit step.
- `test/ci-workflow.test.ts`: stop expecting the step and add an explicit
  regression assertion that `commitlint --last` is absent from the workflow.
- `.changeset/remove-post-merge-commitlint.md`: record an empty Changeset
  because this CI-only change does not require a package release.

## Verification

The focused workflow test must fail before the workflow edit and pass after it.
The final verification will run the focused test, `pnpm lint`, `pnpm typecheck`,
and the full repository check. The pull request must pass policy and both Node
jobs before it is merged.
