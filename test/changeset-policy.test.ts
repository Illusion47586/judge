import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  hasChangesetDecision,
  validateChangesetDecision,
} from "../scripts/check-changeset.ts";

const MISSING_CHANGESET = /normal or empty Changeset/u;
const BASE_SHA_ERROR = /base SHA must be a 40-64 character/u;
const GIT_DIFF = /git diff/u;
const USAGE = /Usage:/u;
const REPOSITORY = "Illusion47586/judge";

const reader =
  (files: Readonly<Record<string, string>>) =>
  (file: string): string => {
    const content = files[file];
    if (content === undefined) {
      throw new Error("Unexpected file read");
    }
    return content;
  };

test("accepts canonical empty and valid normal added Changesets", () => {
  assert.equal(
    hasChangesetDecision(
      ["A\t.changeset/quiet-docs-rest.md"],
      reader({ ".changeset/quiet-docs-rest.md": "---\n---\n" })
    ),
    true
  );
  assert.equal(
    hasChangesetDecision(
      ["A\t.changeset/bright-judges-smile.md"],
      reader({
        ".changeset/bright-judges-smile.md":
          '---\n"@brkn-labs/judge": minor\n---\n\nAdd safer decisions.\n',
      })
    ),
    true
  );
});

test("ignores config, README, modified, deleted, and nested files", () => {
  const failOnRead = (): never => {
    throw new Error("Non-candidate file was read");
  };

  assert.equal(
    hasChangesetDecision(["A\t.changeset/config.json"], failOnRead),
    false
  );
  assert.equal(
    hasChangesetDecision(["A\t.changeset/README.md"], failOnRead),
    false
  );
  assert.equal(
    hasChangesetDecision(["M\t.changeset/existing.md"], failOnRead),
    false
  );
  assert.equal(
    hasChangesetDecision(["D\t.changeset/existing.md"], failOnRead),
    false
  );
  assert.equal(
    hasChangesetDecision(["A\t.changeset/nested/file.md"], failOnRead),
    false
  );
});

test("rejects empty, malformed, wrong-package, wrong-bump, and summaryless files", () => {
  const invalidChangesets = [
    "",
    "not frontmatter\n",
    '---\n"other-package": minor\n---\n\nSummary.\n',
    '---\n"@brkn-labs/judge": huge\n---\n\nSummary.\n',
    '---\n"@brkn-labs/judge": patch\n---\n\n   \n',
  ];

  for (const content of invalidChangesets) {
    assert.equal(
      hasChangesetDecision(
        ["A\t.changeset/invalid.md"],
        reader({ ".changeset/invalid.md": content })
      ),
      false
    );
  }
});

test("rejects an ordinary pull request without a valid decision", () => {
  assert.throws(
    () =>
      validateChangesetDecision(
        ["M\tsrc/index.ts"],
        "feat/new-api",
        REPOSITORY,
        REPOSITORY,
        reader({})
      ),
    MISSING_CHANGESET
  );
  assert.throws(
    () =>
      validateChangesetDecision(
        [],
        "changeset-release/main",
        "",
        "",
        reader({})
      ),
    MISSING_CHANGESET
  );
});

test("exempts only the generated main release branch from the same repository", () => {
  assert.doesNotThrow(() =>
    validateChangesetDecision(
      [],
      "changeset-release/main",
      REPOSITORY,
      REPOSITORY,
      reader({})
    )
  );
  assert.throws(
    () =>
      validateChangesetDecision(
        [],
        "changeset-release/next",
        REPOSITORY,
        REPOSITORY,
        reader({})
      ),
    MISSING_CHANGESET
  );
  assert.throws(
    () =>
      validateChangesetDecision(
        [],
        "changeset-release/main",
        "attacker/judge",
        REPOSITORY,
        reader({})
      ),
    MISSING_CHANGESET
  );
});

test("runs the CLI through a symlink and validates object IDs before Git", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "judge-changeset-policy-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));

  const link = join(directory, "check-changeset.ts");
  symlinkSync(
    fileURLToPath(new URL("../scripts/check-changeset.ts", import.meta.url)),
    link
  );

  const usage = spawnSync(process.execPath, [link], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, USAGE);

  const invalidObject = spawnSync(
    process.execPath,
    [
      link,
      "not-a-git-object",
      "a".repeat(40),
      "feat/new-api",
      REPOSITORY,
      REPOSITORY,
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  assert.equal(invalidObject.status, 1);
  assert.match(invalidObject.stderr, BASE_SHA_ERROR);
  assert.doesNotMatch(invalidObject.stderr, GIT_DIFF);

  const binDirectory = join(directory, "bin");
  const changesetDirectory = join(directory, ".changeset");
  mkdirSync(binDirectory);
  mkdirSync(changesetDirectory);
  const gitArguments = join(directory, "git-arguments.txt");
  const fakeGit = join(binDirectory, "git");
  writeFileSync(
    fakeGit,
    `#!/bin/sh\nprintf '%s\\n' "$@" > '${gitArguments}'\nprintf 'A\\t.changeset/valid.md\\n'\n`
  );
  chmodSync(fakeGit, 0o755);
  writeFileSync(
    join(changesetDirectory, "valid.md"),
    '---\n"@brkn-labs/judge": patch\n---\n\nExercise the CLI.\n'
  );

  const success = spawnSync(
    process.execPath,
    [
      link,
      "a".repeat(40),
      "b".repeat(64),
      "feat/new-api",
      REPOSITORY,
      REPOSITORY,
    ],
    {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH}` },
    }
  );
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stdout, "Changeset decision found.\n");
  const expectedGitArguments = [
    "diff",
    "--name-status",
    "--diff-filter=ADM",
    "--end-of-options",
    `${"a".repeat(40)}...${"b".repeat(64)}`,
  ];
  assert.equal(
    readFileSync(gitArguments, "utf8"),
    `${expectedGitArguments.join("\n")}\n`
  );
});
