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
