import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/u;
const RELEASE_BRANCH = "changeset-release/main";

export const hasChangesetDecision = (lines: readonly string[]): boolean =>
  lines.some((line) => {
    const [status, file] = line.split("\t");
    return status === "A" && file !== undefined && CHANGESET_FILE.test(file);
  });

export const validateChangesetDecision = (
  lines: readonly string[],
  headRef: string
): void => {
  if (headRef === RELEASE_BRANCH || hasChangesetDecision(lines)) {
    return;
  }
  throw new Error(
    "Every pull request must add a normal or empty Changeset. Run `npm run changeset` or `npm run changeset -- --empty`."
  );
};

const changedFiles = (baseSha: string, headSha: string): string[] => {
  const output = execFileSync(
    "git",
    ["diff", "--name-status", "--diff-filter=ADM", `${baseSha}...${headSha}`],
    { encoding: "utf8" }
  );
  return output.split("\n").filter(Boolean);
};

const main = (): void => {
  const [baseSha, headSha, headRef] = process.argv.slice(2);
  if (!(baseSha && headSha && headRef)) {
    throw new Error(
      "Usage: node scripts/check-changeset.ts <base-sha> <head-sha> <head-ref>"
    );
  }
  validateChangesetDecision(changedFiles(baseSha, headSha), headRef);
  process.stdout.write("Changeset decision found.\n");
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
