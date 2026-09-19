import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/u;
const CHANGESET_RELEASE_BRANCH = "changeset-release/main";
const JUDGE_RELEASE = /^"@brkn-labs\/judge": (?:major|minor|patch)$/u;
const OBJECT_ID = /^[\da-f]{40,64}$/iu;

export type ChangesetReader = (file: string) => string;

const readChangeset: ChangesetReader = (file) => readFileSync(file, "utf8");

const hasValidContents = (content: string): boolean => {
  const normalized = content.replaceAll("\r\n", "\n");
  if (normalized === "---\n---\n") {
    return true;
  }

  const lines = normalized.split("\n");
  return (
    lines[0] === "---" &&
    lines[1] !== undefined &&
    JUDGE_RELEASE.test(lines[1]) &&
    lines[2] === "---" &&
    lines[3] === "" &&
    lines.slice(4).join("\n").trim().length > 0
  );
};

export const hasChangesetDecision = (
  lines: readonly string[],
  read: ChangesetReader = readChangeset
): boolean =>
  lines.some((line) => {
    const [status, file] = line.split("\t");
    if (status !== "A" || file === undefined || !CHANGESET_FILE.test(file)) {
      return false;
    }

    try {
      return hasValidContents(read(file));
    } catch {
      return false;
    }
  });

export const validateChangesetDecision = (
  lines: readonly string[],
  headRef: string,
  headRepository: string,
  baseRepository: string,
  read: ChangesetReader = readChangeset
): void => {
  const isTrustedReleaseBranch =
    headRef === CHANGESET_RELEASE_BRANCH &&
    headRepository.length > 0 &&
    headRepository === baseRepository;

  if (isTrustedReleaseBranch || hasChangesetDecision(lines, read)) {
    return;
  }
  throw new Error(
    "Every pull request must add a valid normal or empty Changeset. Run `npm run changeset` or `npm run changeset -- --empty`."
  );
};

const assertObjectId = (value: string, label: "base" | "head"): void => {
  if (!OBJECT_ID.test(value)) {
    throw new Error(
      `${label} SHA must be a 40-64 character hexadecimal Git object ID.`
    );
  }
};

const changedFiles = (baseSha: string, headSha: string): string[] => {
  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-status",
      "--diff-filter=ADM",
      "--end-of-options",
      `${baseSha}...${headSha}`,
    ],
    { encoding: "utf8" }
  );
  return output.split("\n").filter(Boolean);
};

const main = (): void => {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length !== 5 || arguments_.some((value) => value === "")) {
    throw new Error(
      "Usage: node scripts/check-changeset.ts <base-sha> <head-sha> <head-ref> <head-repository> <base-repository>"
    );
  }

  const [baseSha, headSha, headRef, headRepository, baseRepository] =
    arguments_ as [string, string, string, string, string];
  assertObjectId(baseSha, "base");
  assertObjectId(headSha, "head");
  validateChangesetDecision(
    changedFiles(baseSha, headSha),
    headRef,
    headRepository,
    baseRepository
  );
  process.stdout.write("Changeset decision found.\n");
};

const isDirectExecution = (): boolean => {
  const [, entryPoint] = process.argv;
  if (entryPoint === undefined) {
    return false;
  }

  try {
    return (
      realpathSync(entryPoint) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
