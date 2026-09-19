import assert from "node:assert/strict";
import test from "node:test";

import {
  hasChangesetDecision,
  validateChangesetDecision,
} from "../scripts/check-changeset.ts";

const MISSING_CHANGESET = /normal or empty Changeset/u;

test("accepts normal and empty added Changeset files", () => {
  assert.equal(
    hasChangesetDecision(["A\t.changeset/bright-judges-smile.md"]),
    true
  );
  assert.equal(
    hasChangesetDecision(["A\t.changeset/quiet-docs-rest.md"]),
    true
  );
});

test("ignores config, README, modified, deleted, and nested files", () => {
  assert.equal(hasChangesetDecision(["A\t.changeset/config.json"]), false);
  assert.equal(hasChangesetDecision(["A\t.changeset/README.md"]), false);
  assert.equal(hasChangesetDecision(["M\t.changeset/existing.md"]), false);
  assert.equal(hasChangesetDecision(["D\t.changeset/existing.md"]), false);
  assert.equal(hasChangesetDecision(["A\t.changeset/nested/file.md"]), false);
});

test("rejects an ordinary pull request without a decision", () => {
  assert.throws(
    () => validateChangesetDecision(["M\tsrc/index.ts"], "feat/new-api"),
    MISSING_CHANGESET
  );
});

test("exempts only the generated main release branch", () => {
  assert.doesNotThrow(() =>
    validateChangesetDecision([], "changeset-release/main")
  );
  assert.throws(
    () => validateChangesetDecision([], "changeset-release/next"),
    MISSING_CHANGESET
  );
});
