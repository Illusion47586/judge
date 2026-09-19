# Release PR Lifecycle Test Design

## Problem

The generated Changesets release pull request consumes
`.changeset/initial-public-release.md`. The release configuration test reads
that transient file unconditionally, so every valid release pull request fails
CI after versioning.

## Design

Keep the permanent Changesets configuration assertions unconditional. Make the
initial-release assertion depend on the package lifecycle:

- While `package.json` is version `0.0.0`, the seed changeset must exist and
  request a minor release for `@brkn-labs/judge`.
- After the package version changes from `0.0.0`, the seed changeset must no
  longer exist because Changesets has consumed it.

This preserves the original bootstrap guard without requiring an ephemeral
file forever. No runtime package behavior, release workflow, or README content
changes.

## Verification

Exercise both lifecycle states in isolated temporary fixtures, then run the
repository's focused release-config test and complete `pnpm check` gate.
