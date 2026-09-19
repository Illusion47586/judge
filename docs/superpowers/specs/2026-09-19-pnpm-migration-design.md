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
automatically delegates to `pnpm publish` when it detects a pnpm project. The
release script will therefore be invoked through pnpm but will use `npm publish`
only for that final registry transport. No npm command will install dependencies,
run project scripts, pack the project, or serve as a contributor-facing runner.

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
  architecture, Node version, and `pnpm-lock.yaml` hash.

Cache restore keys will not be used. A cache hit may skip installation only when
the entire exact key matches. This retains the previously approved
`node_modules` caching requirement while preventing dependency reuse across
different lockfiles or runtimes.

Release jobs will not restore dependency caches. They will perform fresh frozen
pnpm installs on GitHub-hosted runners before building or publishing.

## Release and OIDC boundary

Changesets remains responsible for calculating versions, consuming changesets,
updating changelogs, and driving release pull requests. The Changesets v2
sub-actions remain split so only the publish job receives `id-token: write`.

The release command is entered through pnpm and performs these operations in
order:

1. build the package through pnpm;
2. execute `npm publish` as the sole npm CLI exception, using npm trusted
   publishing and the GitHub Actions OIDC identity; and
3. execute `pnpm exec changeset git-tag`.

The Changesets action supplies `CHANGESETS_OUTPUT` to the release command.
`changeset git-tag` writes the package tag event to that output, allowing the
Changesets v2 publish action to identify the published package, push the tag,
and create the GitHub release. If the upload or tag generation fails, the job
fails and does not report a successful complete release.

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
- CI cache keys hash `pnpm-lock.yaml` and remain exact per OS, architecture,
  and Node version;
- release jobs perform uncached frozen installs;
- the release command writes Changesets tag metadata after publishing;
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
  failed so maintainers can reconcile the published version and tag explicitly.

## References

- [pnpm package.json configuration](https://pnpm.io/package_json)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Changesets publish behavior](https://github.com/changesets/changesets/blob/main/docs/command-line-options.md#publish)
- [Changesets v2 publish action](https://github.com/changesets/action/blob/main/publish/README.md)
