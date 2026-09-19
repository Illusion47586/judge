import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const RUN_BLOCK = /^\s+run:.*(?:\n(?:\s{10,}.*|\s*$))*/gmu;
const HEAD_REF_EXPRESSION = /\$\{\{\s*github\.head_ref\s*\}\}/u;
const PULL_REQUEST_EXPRESSION =
  /\$\{\{\s*github\.event\.pull_request\.(?:title|base\.sha|head\.sha|head\.repo\.full_name)\s*\}\}/u;
const SAFE_COMMITLINT =
  /run: pnpm commitlint --from "\$BASE_SHA" --to "\$HEAD_SHA" --verbose/u;
const SAFE_CHANGESET_CHECK =
  /run: node scripts\/check-changeset\.ts "\$BASE_SHA" "\$HEAD_SHA" "\$HEAD_REF" "\$HEAD_REPOSITORY" "\$BASE_REPOSITORY"/u;
const READ_ONLY_PERMISSIONS = /permissions:\n {2}contents: read/u;
const HEAD_REF_ENV = /HEAD_REF: \$\{\{ github\.head_ref \}\}/u;
const JOB_HEADER = /^ {2}\S/u;

const extractJob = (name: string): string => {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => JOB_HEADER.test(line));
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;

  return lines.slice(start, end).join("\n");
};

const assertOrdered = (block: string, fragments: readonly string[]): void => {
  let previous = -1;

  for (const fragment of fragments) {
    const current = block.indexOf(fragment, previous + 1);
    assert.ok(current > previous, `missing or out of order: ${fragment}`);
    previous = current;
  }
};

test("CI validates policy and both supported Node lines", () => {
  const policyJob = extractJob("policy");
  const testJob = extractJob("test");

  assertOrdered(policyJob, [
    "uses: actions/checkout@v6",
    "uses: pnpm/action-setup@v6",
    "uses: actions/setup-node@v6",
    "package-manager-cache: false",
    "id: node-modules",
    "uses: actions/cache@v4",
    "path: node_modules",
    `key: node-modules-\${{ runner.os }}-\${{ runner.arch }}-node-24-\${{ hashFiles('pnpm-lock.yaml', 'package.json') }}`,
    "if: steps.node-modules.outputs.cache-hit != 'true'",
    "run: pnpm install --frozen-lockfile",
    'run: pnpm commitlint --from "$BASE_SHA" --to "$HEAD_SHA" --verbose',
    `run: printf '%s\\n' "$PR_TITLE" | pnpm commitlint --verbose`,
    'run: node scripts/check-changeset.ts "$BASE_SHA" "$HEAD_SHA" "$HEAD_REF" "$HEAD_REPOSITORY" "$BASE_REPOSITORY"',
  ]);
  assert.ok(!policyJob.includes("commitlint --last"));
  assert.match(policyJob, HEAD_REF_ENV);

  assertOrdered(testJob, [
    'node: ["22.18.0", "24"]',
    "uses: actions/checkout@v6",
    "uses: pnpm/action-setup@v6",
    "uses: actions/setup-node@v6",
    "package-manager-cache: false",
    "id: node-modules",
    "uses: actions/cache@v4",
    "path: node_modules",
    `key: node-modules-\${{ runner.os }}-\${{ runner.arch }}-node-\${{ matrix.node }}-\${{ hashFiles('pnpm-lock.yaml', 'package.json') }}`,
    "if: steps.node-modules.outputs.cache-hit != 'true'",
    "run: pnpm install --frozen-lockfile",
    "run: pnpm check",
    "run: pnpm build",
    "run: pnpm pack --dry-run",
  ]);
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
  assert.ok(!workflow.includes("restore-keys:"));
});
