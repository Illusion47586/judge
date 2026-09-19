import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const NPM_COMMAND = /\b(?:npm|npx)\b/u;
const NPM_RUNNER_COMMAND =
  /\b(?:npm|npx)\s+(?:ci|exec|install|pack|run|test)\b/u;
const PACKAGES_DECLARATION = /^packages:/mu;
const PNPM_WORKSPACE_CONFIG = `minimumReleaseAgeExclude:
  - '@ai-sdk/gateway@4.0.87'
  - '@ai-sdk/provider-utils@5.0.45'
  - ai@7.0.107
`;

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

const repositoryCommandFiles = [
  ".husky/pre-commit",
  ".husky/commit-msg",
  "scripts/check-changeset.ts",
  ...readdirSync(".github/workflows", { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `.github/workflows/${entry.name}`),
];

test("repository pins pnpm and has one lockfile", () => {
  const packageJson = readJson("package.json");

  assert.equal(packageJson.packageManager, "pnpm@12.4.2");
  assert.equal(existsSync("pnpm-lock.yaml"), true);
  assert.equal(existsSync("package-lock.json"), false);
});

test("pnpm supply-chain exceptions are exact and workspace-free", () => {
  const workspaceConfig = readFileSync("pnpm-workspace.yaml", "utf8");

  assert.equal(workspaceConfig, PNPM_WORKSPACE_CONFIG);
  assert.doesNotMatch(workspaceConfig, PACKAGES_DECLARATION);
});

test("package scripts use pnpm except for the OIDC upload", () => {
  const packageJson = readJson("package.json");
  const scripts = packageJson.scripts as Record<string, string>;

  assert.equal(
    scripts.release,
    "pnpm build && npm publish --ignore-scripts && pnpm exec changeset git-tag"
  );

  for (const [name, command] of Object.entries(scripts)) {
    if (name === "release") {
      continue;
    }
    assert.doesNotMatch(command, NPM_COMMAND, `${name}: ${command}`);
  }
});

test("repository hooks and scripts have no npm runner commands", () => {
  for (const file of repositoryCommandFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), NPM_RUNNER_COMMAND, file);
  }
});
