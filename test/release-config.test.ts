import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const COMMITLINT_CONFIG = /@commitlint\/config-conventional/u;
const INITIAL_RELEASE = /"@brkn-labs\/judge": minor/u;
const INVALID_COMMIT_MESSAGE = /type may not be empty/u;
const MIT_COPYRIGHT = /Copyright \(c\) 2026 Dhruv Tiwari/u;
const MIT_GRANT =
  /Permission is hereby granted, free of charge, to any person obtaining a copy/u;
const EXECUTABLE_DIVISORS = [64, 8, 1] as const;

const hasExecutableBit = (file: string): boolean => {
  const { mode } = statSync(file);

  return EXECUTABLE_DIVISORS.some(
    (divisor) => Math.floor(mode / divisor) % 2 === 1
  );
};

const runCommitlint = (message: string) =>
  spawnSync("pnpm", ["commitlint", "--verbose"], {
    encoding: "utf8",
    input: `${message}\n`,
  });

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

test("package is public and exposes release commands", () => {
  const packageJson = readJson("package.json");
  const scripts = packageJson.scripts as Record<string, string>;
  const publishConfig = packageJson.publishConfig as Record<string, string>;
  const repository = packageJson.repository as Record<string, string>;

  assert.equal("private" in packageJson, false);
  assert.equal(packageJson.license, "MIT");
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
  assert.equal(scripts.prepare, "node .husky/install.mjs");
  assert.equal(scripts["version-packages"], "changeset version");
  assert.equal(
    scripts.release,
    "pnpm build && node scripts/publish-release.ts"
  );
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

  assert.equal(preCommit, "pnpm lint && pnpm typecheck\n");
  assert.equal(commitMessage, 'pnpm commitlint --edit "$1"\n');
  assert.match(commitlint, COMMITLINT_CONFIG);
  assert.equal(hasExecutableBit(".husky/pre-commit"), true);
  assert.equal(hasExecutableBit(".husky/commit-msg"), true);
});

test("Commitlint accepts valid messages and rejects invalid messages", () => {
  const valid = runCommitlint("feat: add release automation");
  const invalid = runCommitlint("add release automation");

  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stdout, INVALID_COMMIT_MESSAGE);
});

test("production-only installs succeed without Husky", () => {
  const fixture = mkdtempSync(join(tmpdir(), "judge-production-install-"));

  try {
    mkdirSync(join(fixture, ".husky"));
    copyFileSync("package.json", join(fixture, "package.json"));
    copyFileSync("pnpm-lock.yaml", join(fixture, "pnpm-lock.yaml"));
    copyFileSync("pnpm-workspace.yaml", join(fixture, "pnpm-workspace.yaml"));
    copyFileSync(".husky/install.mjs", join(fixture, ".husky/install.mjs"));

    const safeEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => key !== "NODE_AUTH_TOKEN" && key !== "NPM_TOKEN"
      )
    );
    const install = spawnSync(
      "pnpm",
      ["install", "--prod", "--frozen-lockfile"],
      {
        cwd: fixture,
        encoding: "utf8",
        env: { ...safeEnvironment, NODE_ENV: "production" },
      }
    );

    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.equal(existsSync(join(fixture, "node_modules/husky")), false);
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
});

test("package includes the MIT license", () => {
  const license = readFileSync("LICENSE", "utf8");
  const pack = spawnSync(
    "pnpm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      encoding: "utf8",
    }
  );

  assert.match(license, MIT_COPYRIGHT);
  assert.match(license, MIT_GRANT);
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);

  const manifest = JSON.parse(pack.stdout) as {
    files: Array<{ path: string }>;
  };
  assert.equal(
    manifest.files.some(({ path }) => path === "LICENSE"),
    true
  );
});
