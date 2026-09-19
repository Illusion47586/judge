import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const RUN_BLOCK = /^\s+run:.*(?:\n(?:\s{10,}.*|\s*$))*/gmu;
const HEAD_REF_EXPRESSION = /\$\{\{\s*github\.head_ref\s*\}\}/u;
const PULL_REQUEST_EXPRESSION =
  /\$\{\{\s*github\.event\.pull_request\.(?:title|base\.sha|head\.sha|head\.repo\.full_name)\s*\}\}/u;
const SAFE_COMMITLINT =
  /run: npm run commitlint -- --from "\$BASE_SHA" --to "\$HEAD_SHA" --verbose/u;
const SAFE_CHANGESET_CHECK =
  /run: node scripts\/check-changeset\.ts "\$BASE_SHA" "\$HEAD_SHA" "\$HEAD_REF" "\$HEAD_REPOSITORY" "\$BASE_REPOSITORY"/u;
const READ_ONLY_PERMISSIONS = /permissions:\n {2}contents: read/u;
const HEAD_REF_ENV = /HEAD_REF: \$\{\{ github\.head_ref \}\}/u;

test("CI validates policy and both supported Node lines", () => {
  assert.ok(workflow.includes("name: Policy"));
  assert.ok(workflow.includes('node: ["22.18.0", "24"]'));
  assert.ok(workflow.includes("npm run check"));
  assert.ok(workflow.includes("npm run build"));
  assert.ok(workflow.includes("npm pack --dry-run"));
  assert.ok(workflow.includes("commitlint -- --from"));
  assert.ok(workflow.includes("commitlint -- --last"));
  assert.ok(workflow.includes("PR_TITLE"));
  assert.match(workflow, HEAD_REF_ENV);
  assert.ok(workflow.includes("scripts/check-changeset.ts"));
});

test("untrusted pull request values never appear directly in shell commands", () => {
  const runBlocks = [...workflow.matchAll(RUN_BLOCK)]
    .map(([block]) => block)
    .join("\n");

  assert.doesNotMatch(runBlocks, HEAD_REF_EXPRESSION);
  assert.doesNotMatch(runBlocks, PULL_REQUEST_EXPRESSION);
  assert.match(workflow, SAFE_COMMITLINT);
  assert.match(workflow, SAFE_CHANGESET_CHECK);
});

test("CI caches exact node_modules trees with read-only permissions", () => {
  assert.match(workflow, READ_ONLY_PERMISSIONS);
  assert.ok(workflow.includes("path: node_modules"));
  assert.ok(workflow.includes("runner.os"));
  assert.ok(workflow.includes("runner.arch"));
  assert.ok(workflow.includes("matrix.node"));
  assert.ok(workflow.includes("hashFiles('package-lock.json')"));
  assert.ok(!workflow.includes("restore-keys:"));
  assert.ok(workflow.includes("cache-hit != 'true'"));
});
