import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const COMMITLINT_CONFIG = /@commitlint\/config-conventional/u;
const INITIAL_RELEASE = /"@brkn-labs\/judge": minor/u;

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

test("package is public and exposes release commands", () => {
  const packageJson = readJson("package.json");
  const scripts = packageJson.scripts as Record<string, string>;
  const publishConfig = packageJson.publishConfig as Record<string, string>;
  const repository = packageJson.repository as Record<string, string>;

  assert.equal("private" in packageJson, false);
  assert.equal(publishConfig.access, "public");
  assert.equal(repository.type, "git");
  assert.equal(
    repository.url,
    "git+https://github.com/Illusion47586/judge.git"
  );
  assert.equal(
    packageJson.homepage,
    "https://github.com/Illusion47586/judge#readme"
  );
  assert.deepEqual(packageJson.bugs, {
    url: "https://github.com/Illusion47586/judge/issues",
  });
  assert.equal(scripts.changeset, "changeset");
  assert.equal(scripts["changeset:status"], "changeset status");
  assert.equal(scripts.commitlint, "commitlint");
  assert.equal(scripts.prepare, "husky");
  assert.equal(scripts["version-packages"], "changeset version");
  assert.equal(scripts.release, "npm run build && changeset publish");
});

test("Changesets targets public main releases", () => {
  const config = readJson(".changeset/config.json");
  const initialChangeset = readFileSync(
    ".changeset/initial-public-release.md",
    "utf8"
  );

  assert.equal(config.baseBranch, "main");
  assert.equal(config.access, "public");
  assert.equal(config.commit, false);
  assert.equal(config.changelog, "@changesets/cli/changelog");
  assert.match(initialChangeset, INITIAL_RELEASE);
});

test("local hooks enforce quality and Conventional Commits", () => {
  const preCommit = readFileSync(".husky/pre-commit", "utf8");
  const commitMessage = readFileSync(".husky/commit-msg", "utf8");
  const commitlint = readFileSync("commitlint.config.ts", "utf8");

  assert.equal(preCommit, "npm run lint && npm run typecheck\n");
  assert.equal(commitMessage, 'npm run commitlint -- --edit "$1"\n');
  assert.match(commitlint, COMMITLINT_CONFIG);
});
