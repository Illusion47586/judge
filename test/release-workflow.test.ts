import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const SELECT_MODE_ACTION = /changesets\/action\/select-mode@v2\.1\.2/u;
const VERSION_ACTION = /changesets\/action\/version@v2\.1\.2/u;
const PUBLISH_ACTION = /changesets\/action\/publish@v2\.1\.2/u;
const APP_TOKEN_ACTION = /actions\/create-github-app-token@v3\.2\.0/u;
const APP_CLIENT_ID = /RELEASE_APP_CLIENT_ID/u;
const APP_PRIVATE_KEY = /RELEASE_APP_PRIVATE_KEY/u;
const APP_TOKEN_INPUT =
  /github-token: \$\{\{ steps\.app-token\.outputs\.token \}\}/u;
const VERSION_SCRIPT = /script: pnpm version-packages/u;
const RELEASE_SCRIPT = /script: pnpm release/u;
const PNPM_SETUP = /uses: pnpm\/action-setup@v6/gu;
const FROZEN_INSTALL = /run: pnpm install --frozen-lockfile/gu;
const ACTIONS_CACHE = /actions\/cache/u;
const RESTORE_KEYS = /restore-keys:/u;
const OIDC_PERMISSION = /id-token: write/u;
const NPM_REGISTRY = /registry-url: "https:\/\/registry\.npmjs\.org"/u;
const PACKAGE_MANAGER_CACHE = /package-manager-cache: false/u;
const NPM_TOKEN = /NPM_TOKEN|NODE_AUTH_TOKEN/u;
const NPM_RUNNER = /\bnpm\s+(?:ci|install|run|pack|test)\b/u;
const EMPTY_DEFAULT_PERMISSIONS = /^permissions: \{\}$/mu;
const JOB_CONTENTS_READ = /^ {6}contents: read$/gmu;
const JOB_CONTENTS_WRITE = /^ {6}contents: write$/gmu;
const JOB_ID_TOKEN_WRITE = /^ {6}id-token: write$/gmu;
const APP_CONTENTS_WRITE = /^ {10}permission-contents: write$/gmu;
const APP_PULL_REQUESTS_WRITE = /^ {10}permission-pull-requests: write$/gmu;
const GITHUB_TOKEN_INPUT = /github-token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u;

test("release workflow separates selection, versioning, and publishing", () => {
  assert.match(workflow, SELECT_MODE_ACTION);
  assert.match(workflow, VERSION_ACTION);
  assert.match(workflow, PUBLISH_ACTION);
  assert.match(workflow, APP_TOKEN_ACTION);
  assert.match(workflow, APP_CLIENT_ID);
  assert.match(workflow, APP_PRIVATE_KEY);
  assert.match(workflow, APP_TOKEN_INPUT);
  assert.match(workflow, VERSION_SCRIPT);
  assert.match(workflow, RELEASE_SCRIPT);
  assert.match(workflow, EMPTY_DEFAULT_PERMISSIONS);
  assert.equal(workflow.match(JOB_CONTENTS_READ)?.length, 2);
  assert.equal(workflow.match(APP_CONTENTS_WRITE)?.length, 1);
  assert.equal(workflow.match(APP_PULL_REQUESTS_WRITE)?.length, 1);
});

test("every release job sets up pinned pnpm and installs fresh", () => {
  assert.equal(workflow.match(PNPM_SETUP)?.length, 3);
  assert.equal(workflow.match(FROZEN_INSTALL)?.length, 3);
  assert.doesNotMatch(workflow, ACTIONS_CACHE);
  assert.doesNotMatch(workflow, RESTORE_KEYS);
});

test("publishing is OIDC-only and fails closed", () => {
  assert.match(workflow, OIDC_PERMISSION);
  assert.match(workflow, NPM_REGISTRY);
  assert.match(workflow, PACKAGE_MANAGER_CACHE);
  assert.match(workflow, GITHUB_TOKEN_INPUT);
  assert.equal(workflow.match(JOB_CONTENTS_WRITE)?.length, 1);
  assert.equal(workflow.match(JOB_ID_TOKEN_WRITE)?.length, 1);
  assert.doesNotMatch(workflow, NPM_TOKEN);
  assert.doesNotMatch(workflow, NPM_RUNNER);
});

test("the inert release script preserves Changesets v2 output reporting", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts.release,
    "pnpm build && npm publish --ignore-scripts && pnpm exec changeset git-tag"
  );
});
