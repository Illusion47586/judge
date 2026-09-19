# Releasing Judge

## Automated flow

Merges to `main` accumulate Changesets. The Release workflow creates or updates
`chore(release): version package`. Merging that pull request publishes the
version to the npm registry, creates the Git tag, and creates the GitHub release.

Release jobs run fresh `pnpm install --frozen-lockfile` installs without a
dependency cache. pnpm runs every project command. The release script uses npm
only for its internal `npm publish --ignore-scripts` OIDC registry upload. The
release helper first queries the exact package version on the public registry.
It uploads only after a 404, accepts only matching package metadata after a
200, and fails closed for every other result. After either a successful upload
or confirmation of the exact existing version, it runs Changesets tag reporting.

## GitHub automation apps

Install the hosted Changeset Bot on `Illusion47586/judge` for advisory pull
request feedback.

Create a repository-owned GitHub App for release pull requests with only:

- Repository contents: read and write
- Pull requests: read and write

Install it only on `Illusion47586/judge`. Store its client ID as the repository
variable `RELEASE_APP_CLIENT_ID` and its private key as the repository secret
`RELEASE_APP_PRIVATE_KEY`. The Release workflow mints a short-lived installation
token for the Changesets version action. Do not use a personal access token or
the built-in `GITHUB_TOKEN` for release pull requests.

## One-time npm OIDC bootstrap

1. Create or verify the `brkn-labs` organization on npm and publishing access
   for `@brkn-labs/judge`.
2. From a clean checkout of `main`, run `pnpm check`, `pnpm build`, and
   `pnpm pack --dry-run`, then manually publish public version `0.0.0` using the
   maintainer's interactive npm authentication.
3. Open the npm package settings and add a GitHub Actions trusted publisher:
   - owner: `Illusion47586`
   - repository: `judge`
   - workflow filename: `release.yml`
4. Verify the release GitHub App variable and secret are configured.
5. Merge the generated release pull request to publish `0.1.0` through OIDC.

Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN`. If trusted publishing is not ready,
the publish job must fail closed.

## Recovery

If versioning fails, verify the release GitHub App installation, client ID,
private key, and repository permissions before rerunning the workflow. If
publishing fails after the release pull request merged, correct the npm trusted
publisher and rerun the failed publish job; do not create another version bump.

If `npm publish --ignore-scripts` succeeds but tag creation fails, rerun the
failed publish job. The retry is safe because the helper confirms the exact
published package name and version before skipping upload and emitting tag
metadata. A mismatch or malformed registry response fails closed.
