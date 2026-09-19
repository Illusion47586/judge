import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const EMPTY_DEFAULT_PERMISSIONS = /^permissions: \{\}$/mu;
const CHECKOUT_WITHOUT_CREDENTIALS = `- uses: actions/checkout@v6
        with:
          persist-credentials: false`;
const NO_RELEASE_TOKEN = /NPM_TOKEN|NODE_AUTH_TOKEN/u;
const NO_DEPENDENCY_CACHE = /actions\/cache|restore-keys:/u;
const NO_NPM_RUNNER = /\bnpm\s+(?:ci|install|run|pack|test)\b/u;
const NON_SELECT_ACTION = /changesets\/action\/(?:version|publish)/u;
const NON_VERSION_ACTION = /changesets\/action\/(?:select-mode|publish)/u;
const NON_PUBLISH_ACTION = /changesets\/action\/(?:select-mode|version)/u;
const APP_TOKEN_INPUT =
  /github-token: \$\{\{ steps\.app-token\.outputs\.token \}\}/u;
const GITHUB_TOKEN_INPUT = /github-token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u;

const jobBlock = (name: string, nextName?: string): string => {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `${name} job is missing`);
  const end =
    nextName === undefined
      ? workflow.length
      : workflow.indexOf(`  ${nextName}:\n`);
  assert.notEqual(end, -1, `${nextName} job is missing`);
  return workflow.slice(start, end);
};

const assertOrdered = (block: string, fragments: readonly string[]): void => {
  let previous = -1;
  for (const fragment of fragments) {
    const index = block.indexOf(fragment);
    assert.ok(index > previous, `${fragment} is missing or out of order`);
    previous = index;
  }
};

const jobPermissions = (block: string): string[] => {
  const lines = block.split("\n");
  const start = lines.indexOf("    permissions:");
  assert.notEqual(start, -1, "job permissions are missing");
  const permissions: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("      ")) {
      break;
    }
    permissions.push(line.trim());
  }
  return permissions;
};

const jobRouting = (block: string): string[] =>
  block
    .split("\n")
    .filter(
      (line) => line.startsWith("    if:") || line.startsWith("    needs:")
    )
    .map((line) => line.trim());

test("select-mode has read-only permissions and an isolated setup", () => {
  const block = jobBlock("select-mode", "version");

  assert.match(workflow, EMPTY_DEFAULT_PERMISSIONS);
  assert.deepEqual(jobPermissions(block), ["contents: read"]);
  assert.deepEqual(jobRouting(block), []);
  assert.equal(block.includes(CHECKOUT_WITHOUT_CREDENTIALS), true);
  assertOrdered(block, [
    "actions/checkout@v6",
    "pnpm/action-setup@v6",
    "actions/setup-node@v6",
    "pnpm install --frozen-lockfile",
    "pnpm build",
    "changesets/action/select-mode@v2.1.2",
  ]);
  assert.doesNotMatch(block, NON_SELECT_ACTION);
});

test("version uses only read permissions plus its short-lived app token", () => {
  const block = jobBlock("version", "publish");

  assert.deepEqual(jobRouting(block), [
    "if: needs.select-mode.outputs.mode == 'version'",
    "needs: select-mode",
  ]);
  assert.deepEqual(jobPermissions(block), ["contents: read"]);
  assert.equal(block.includes(CHECKOUT_WITHOUT_CREDENTIALS), true);
  assert.equal(block.includes("permission-contents: write"), true);
  assert.equal(block.includes("permission-pull-requests: write"), true);
  assert.match(block, APP_TOKEN_INPUT);
  assert.equal(block.includes("script: pnpm version-packages"), true);
  assertOrdered(block, [
    "actions/checkout@v6",
    "pnpm/action-setup@v6",
    "actions/setup-node@v6",
    "pnpm install --frozen-lockfile",
    "pnpm build",
    "actions/create-github-app-token@v3.2.0",
    "changesets/action/version@v2.1.2",
  ]);
  assert.doesNotMatch(block, NON_VERSION_ACTION);
});

test("publish alone receives OIDC and contents-write permissions", () => {
  const block = jobBlock("publish");

  assert.deepEqual(jobRouting(block), [
    "if: needs.select-mode.outputs.mode == 'publish'",
    "needs: select-mode",
  ]);
  assert.deepEqual(jobPermissions(block), [
    "contents: write",
    "id-token: write",
  ]);
  assert.equal(block.includes(CHECKOUT_WITHOUT_CREDENTIALS), true);
  assert.equal(
    block.includes('registry-url: "https://registry.npmjs.org"'),
    true
  );
  assert.equal(block.includes("package-manager-cache: false"), true);
  assert.match(block, GITHUB_TOKEN_INPUT);
  assert.equal(block.includes("script: pnpm release"), true);
  assertOrdered(block, [
    "actions/checkout@v6",
    "pnpm/action-setup@v6",
    "actions/setup-node@v6",
    "pnpm install --frozen-lockfile",
    "changesets/action/publish@v2.1.2",
  ]);
  assert.doesNotMatch(block, NON_PUBLISH_ACTION);
});

test("release jobs install fresh and publishing has no token fallback", () => {
  assert.equal(workflow.split("uses: pnpm/action-setup@v6").length - 1, 3);
  assert.equal(
    workflow.split("run: pnpm install --frozen-lockfile").length - 1,
    3
  );
  assert.equal(workflow.split("persist-credentials: false").length - 1, 3);
  assert.doesNotMatch(workflow, NO_DEPENDENCY_CACHE);
  assert.doesNotMatch(workflow, NO_RELEASE_TOKEN);
  assert.doesNotMatch(workflow, NO_NPM_RUNNER);
});

test("the inert release script delegates idempotent publishing to Node", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.equal(
    packageJson.scripts.release,
    "pnpm build && node scripts/publish-release.ts"
  );
});
