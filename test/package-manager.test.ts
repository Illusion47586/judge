import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const NPM_COMMAND = /\b(?:npm|npx)\b/u;
const NPM_RUNNER_COMMAND =
  /\b(?:npm|npx)\s+(?:ci|exec|install|pack|run|test)\b/u;

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

const executableFiles = [
  ".husky/pre-commit",
  ".husky/commit-msg",
  "scripts/check-changeset.ts",
];

test("repository pins pnpm and has one lockfile", () => {
  const packageJson = readJson("package.json");

  assert.equal(packageJson.packageManager, "pnpm@12.4.2");
  assert.equal(existsSync("pnpm-lock.yaml"), true);
  assert.equal(existsSync("package-lock.json"), false);
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

test("maintained executable configuration has no npm runner commands", () => {
  for (const file of executableFiles) {
    assert.doesNotMatch(readFileSync(file, "utf8"), NPM_RUNNER_COMMAND, file);
  }
});
