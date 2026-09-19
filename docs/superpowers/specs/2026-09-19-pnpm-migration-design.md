# Repository-wide pnpm Migration Design

**Date:** 2026-09-19

**Status:** Approved

## Summary

Judge will use pnpm 12.4.2 as its sole package manager and command runner for
local development, package scripts, Git hooks, tests, examples, continuous
integration, packaging, and release orchestration. The repository will pin the
exact pnpm version in `package.json` and replace `package-lock.json` with
`pnpm-lock.yaml`.

The only exception is the final upload to the npm registry. npm trusted
publishing requires an npm CLI version with OIDC support, while Changesets
automatically delegates to `pnpm publish` when it detects a pnpm project. A
repository-owned release helper will therefore use `npm publish` only for that
final registry transport. No npm command will install dependencies, run project
scripts, pack the project, or serve as a contributor-facing runner.

README files are explicitly outside the scope of this migration.

## Goals

1. Pin pnpm 12.4.2 as the reproducible package-manager version.
2. Use pnpm for every contributor-facing and CI command.
3. Use a single `pnpm-lock.yaml` and reject a committed `package-lock.json`.
4. Preserve exact-hit `node_modules` caching in quality CI jobs.
5. Preserve uncached, clean release installs.
6. Keep npm OIDC trusted publishing without adding an npm token.
7. Preserve Changesets release metadata, Git tags, and GitHub releases.
8. Update maintained command documentation without editing README files or
   rewriting completed historical plans.

## Non-goals

- Changing Judge's public API or runtime behavior.
- Changing the package name, registry, release versioning policy, or supported
  Node versions.
- Adding additional workspace packages or multi-package workspace behavior.
- Rewriting completed historical implementation plans to make past execution
  appear pnpm-based.
- Publishing a package during the migration.
- Editing any README file.

## Package-manager contract

`package.json` is the package-manager source of truth and will declare:

```json
{
  "packageManager": "pnpm@12.4.2"
}
```

The repository will contain `pnpm-lock.yaml` and will not contain
`package-lock.json`. All dependency changes must update the pnpm lockfile.
CI installs dependencies with `pnpm install --frozen-lockfile`, causing stale or
inconsistent manifests to fail instead of mutating the lockfile.

pnpm 12's project-level settings live in `pnpm-workspace.yaml`, even for a
single root package. Judge will use that file only for exact, version-specific
`minimumReleaseAgeExclude` entries required by already-approved dependencies.
It will not declare additional workspace packages or disable the default
minimum-release-age protection globally.

Package scripts will invoke sibling scripts with pnpm. This includes build,
check, example, prepack, release, and type-contract chains. Direct binaries such
as `tsc`, `node`, `ultracite`, `commitlint`, and `changeset` may remain direct
inside package scripts because pnpm supplies the package script execution
environment. Developers and automation invoke those scripts through pnpm.

## Local development and Git hooks

Husky's guarded installation remains unchanged in purpose: production installs
and CI do not install hooks, while local development installs them. The
pre-commit hook will run lint and typecheck through pnpm. The commit-message hook
will run Commitlint through pnpm.

Subprocess-based repository tests will use pnpm for project scripts, packaging,
and isolated installs. The isolated consumer test will create a clean fixture,
copy the pnpm manifests, and run a production-only frozen pnpm install to prove
that consumers do not require development dependencies.

## Continuous integration

Every CI job that runs project commands will set up Node and the exact pnpm
version declared by `package.json` before installation. Quality jobs will use:

- `pnpm install --frozen-lockfile` on a cache miss;
- pnpm-based lint, typecheck, unit-test, build, and package commands; and
- exact `node_modules` cache keys containing the operating system,
  architecture, Node version, `package.json` hash, and `pnpm-lock.yaml` hash.

Cache restore keys will not be used. A cache hit may skip installation only when
the entire exact key matches. This retains the previously approved
`node_modules` caching requirement while preventing dependency reuse across
different manifests, lockfiles, or runtimes. Including both manifest and
lockfile hashes ensures a dependency declaration that forgot to update the
lockfile cannot reuse a cache and bypass the frozen-install validation.

Release jobs will not restore dependency caches. They will perform fresh frozen
pnpm installs on GitHub-hosted runners before building or publishing.

## Release and OIDC boundary

Changesets remains responsible for calculating versions, consuming changesets,
updating changelogs, and driving release pull requests. The Changesets v2
sub-actions remain split so only the publish job receives `id-token: write`.

The release command is entered through pnpm and performs these operations in
order:

1. build the package through pnpm;
2. query the public npm registry for the exact local package name and version;
3. when the exact version is absent, execute `npm publish --ignore-scripts` as
   the sole npm CLI exception using the GitHub Actions OIDC identity;
4. when the registry already contains the exact matching name and version, skip
   the immutable upload; and
5. after either a successful upload or an exact existing-version confirmation,
   execute `pnpm exec changeset git-tag`.

The helper fails closed on network errors, unexpected registry statuses,
malformed metadata, name/version mismatches, or publish failures. It invokes
commands with argument arrays rather than a shell. This makes release retries
idempotent when npm accepted a version but tag or GitHub-release creation failed:
the retry confirms that exact public version and continues to emit tag metadata.

The Changesets action supplies `CHANGESETS_OUTPUT` to the release command.
`changeset git-tag` normally writes the package tag event to that output. If an
exact tag already exists and the CLI emits no event, the helper appends the
single expected root-package event itself. It preserves one exact event and
fails closed on malformed, conflicting, or duplicate events. This allows the
Changesets v2 publish action to identify the published package, tolerate an
already-pushed tag, and create a missing GitHub release on retry. If the upload,
tag generation, or output reconciliation fails, the job does not report a
successful complete release.

The publish job must use Node 24 with an npm CLI version new enough for trusted
publishing, a GitHub-hosted runner, `id-token: write`, and no long-lived npm
credential. It must not set `NPM_TOKEN` or `NODE_AUTH_TOKEN` for publishing.

## Documentation scope

Maintained specifications, the active release-governance plan, examples, hook
messages, and executable guidance will use pnpm commands. Completed historical
implementation plans will remain unchanged because they document commands that
were actually executed before this migration.

References to an "npm package," the "npm registry," npm trusted publishing, or
other registry concepts are terminology rather than runner usage and remain
valid. The final `npm publish` command is the only allowlisted executable npm
command. README files will not be changed.

## Validation

Automated tests will verify:

- `packageManager` is exactly `pnpm@12.4.2`;
- `pnpm-lock.yaml` exists and `package-lock.json` does not;
- package scripts, Git hooks, subprocess tests, and workflows use pnpm;
- the only executable npm command in maintained configuration is the final
  OIDC `npm publish` transport;
- CI installs pnpm before dependency installation;
- CI cache keys hash `package.json` and `pnpm-lock.yaml` and remain exact per
  OS, architecture, and Node version;
- release jobs perform uncached frozen installs;
- the release helper publishes an absent version, skips an exact existing
  version, rejects ambiguous registry state, and writes Changesets tag metadata
  only after a successful upload or exact confirmation;
- production-only isolated installation succeeds; and
- package contents and exports remain unchanged after packing.

The complete verification gate will run lint, ordinary typechecking, public type
contracts, example typechecking, unit tests, coverage, build, package inspection,
and Ultracite doctor through pnpm on the supported Node versions.

## Failure behavior

- An absent or stale pnpm lockfile fails frozen installation.
- A committed npm lockfile fails the package-manager contract tests.
- An accidental npm runner command outside the one release exception fails the
  repository scan.
- A package-manager setup, lifecycle, lint, type, test, build, or pack failure
  fails its local or CI command immediately.
- An invalid or unavailable OIDC identity causes `npm publish` to fail without a
  token fallback.
- If publication succeeds but tag generation fails, the release job remains
  failed; rerunning confirms the exact public version and reconciles the tag
  event without attempting to republish the immutable version.

## References

- [pnpm package.json configuration](https://pnpm.io/package_json)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Changesets publish behavior](https://github.com/changesets/changesets/blob/main/docs/command-line-options.md#publish)
- [Changesets v2 publish action](https://github.com/changesets/action/blob/main/publish/README.md)
