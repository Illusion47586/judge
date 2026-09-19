import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const BODY_KEY = /^body:/mu;
const CONVENTIONAL_COMMITS = /Conventional Commits/u;
const DESCRIPTION_KEY = /^description: .+/mu;
const EMPTY_CHANGESET = /empty Changeset/u;
const NAME_KEY = /^name: .+/mu;
const NORMAL_CHANGESET = /normal Changeset/u;
const PNPM_CHECK = /`pnpm check`/u;
const REQUIRED_VALIDATION = /validations:\n {6}required: true/u;
const REQUIRED_TRUE = /required: true/u;

const read = (path: string): string => readFileSync(path, "utf8");

const fieldBlock = (form: string, id: string): string => {
  const marker = `    id: ${id}\n`;
  const start = form.indexOf(marker);
  assert.notEqual(start, -1, `missing issue-form field: ${id}`);
  const next = form.indexOf("\n  - type:", start + marker.length);
  return form.slice(start, next === -1 ? form.length : next);
};

const assertForm = (
  path: string,
  required: readonly string[],
  optional: readonly string[]
): void => {
  const form = read(path);
  assert.match(form, NAME_KEY);
  assert.match(form, DESCRIPTION_KEY);
  assert.match(form, BODY_KEY);
  assert.ok(!form.includes("labels:"));
  assert.ok(!form.includes("assignees:"));
  assert.ok(!form.includes("projects:"));

  for (const id of required) {
    assert.match(fieldBlock(form, id), REQUIRED_VALIDATION);
  }
  for (const id of optional) {
    assert.doesNotMatch(fieldBlock(form, id), REQUIRED_TRUE);
  }
};

test("issue forms collect actionable bug and feature details", () => {
  assertForm(
    ".github/ISSUE_TEMPLATE/01-bug-report.yml",
    ["description", "reproduction", "expected", "environment"],
    ["logs", "additional-context"]
  );
  assertForm(
    ".github/ISSUE_TEMPLATE/02-feature-request.yml",
    ["problem", "solution"],
    ["alternatives", "additional-context"]
  );
});

test("issue chooser disables blank contributor issues", () => {
  assert.equal(
    read(".github/ISSUE_TEMPLATE/config.yml"),
    "blank_issues_enabled: false\n"
  );
});

test("pull request template exposes repository policy", () => {
  const template = read(".github/pull_request_template.md");
  for (const heading of [
    "## Related issue",
    "## Summary",
    "## Motivation",
    "## Changes",
    "## Verification",
    "## Release decision",
    "## Checklist",
  ]) {
    assert.ok(template.includes(heading), `missing PR heading: ${heading}`);
  }
  assert.match(template, CONVENTIONAL_COMMITS);
  assert.match(template, PNPM_CHECK);
  assert.match(template, NORMAL_CHANGESET);
  assert.match(template, EMPTY_CHANGESET);
});
