import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REGISTRY_ORIGIN = "https://registry.npmjs.org";
const ENCODED_SCOPE_PREFIX = /^%40/u;

export type PackageIdentity = Readonly<{
  name: string;
  version: string;
}>;

export type ReleaseCommandRunner = (
  command: string,
  arguments_: readonly string[]
) => Promise<void>;

export type PublishReleaseDependencies = Readonly<{
  changesetsOutputPath?: string;
  fetchVersion: typeof fetch;
  runCommand: ReleaseCommandRunner;
}>;

const encodePackageName = (name: string): string =>
  encodeURIComponent(name).replace(ENCODED_SCOPE_PREFIX, "@");

const versionUrl = ({ name, version }: PackageIdentity): string =>
  `${REGISTRY_ORIGIN}/${encodePackageName(name)}/${encodeURIComponent(version)}`;

const validateIdentity = (
  value: unknown,
  source: "package.json" | "registry metadata"
): PackageIdentity => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    !("version" in value) ||
    typeof value.version !== "string" ||
    value.version.length === 0
  ) {
    throw new Error(`${source} must contain a nonempty name and version.`);
  }

  return { name: value.name, version: value.version };
};

type GitTagEvent = Readonly<{
  packageName: string;
  tag: string;
  type: "git-tag";
}>;

const expectedTagEvent = ({ name, version }: PackageIdentity): GitTagEvent => ({
  packageName: name,
  tag: `v${version}`,
  type: "git-tag",
});

const isExactTagEvent = (value: unknown, expected: GitTagEvent): boolean => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const keys = Object.keys(value).toSorted();
  return (
    keys.length === 3 &&
    keys[0] === "packageName" &&
    keys[1] === "tag" &&
    keys[2] === "type" &&
    "packageName" in value &&
    value.packageName === expected.packageName &&
    "tag" in value &&
    value.tag === expected.tag &&
    "type" in value &&
    value.type === expected.type
  );
};

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const reconcileChangesetsOutput = async (
  outputPath: string | undefined,
  identity: PackageIdentity
): Promise<void> => {
  if (outputPath === undefined) {
    return;
  }

  let existing = "";
  try {
    existing = await readFile(outputPath, "utf8");
  } catch (error: unknown) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const records = existing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const expected = expectedTagEvent(identity);

  if (records.length === 1) {
    let event: unknown;
    try {
      event = JSON.parse(records[0] ?? "");
    } catch (error: unknown) {
      throw new Error("The Changesets output contains an invalid event.", {
        cause: error,
      });
    }

    if (isExactTagEvent(event, expected)) {
      return;
    }
    throw new Error("The Changesets output contains an invalid event.");
  }

  if (records.length > 1) {
    throw new Error("The Changesets output contains invalid events.");
  }

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const serialized = `{"type":"git-tag","tag":${JSON.stringify(expected.tag)},"packageName":${JSON.stringify(expected.packageName)}}\n`;
  await appendFile(outputPath, `${separator}${serialized}`, "utf8");
};

export const publishRelease = async (
  packageIdentity: PackageIdentity,
  dependencies: PublishReleaseDependencies
): Promise<void> => {
  const expected = validateIdentity(packageIdentity, "package.json");
  const response = await dependencies.fetchVersion(versionUrl(expected), {
    headers: { accept: "application/json" },
    method: "GET",
  });

  if (response.status === 404) {
    await dependencies.runCommand("npm", ["publish", "--ignore-scripts"]);
  } else if (response.status === 200) {
    let actual: PackageIdentity;
    try {
      actual = validateIdentity(await response.json(), "registry metadata");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to validate registry metadata: ${message}`, {
        cause: error,
      });
    }

    if (actual.name !== expected.name || actual.version !== expected.version) {
      throw new Error(
        `The registry metadata did not match ${expected.name}@${expected.version}.`
      );
    }
  } else {
    throw new Error(
      `The registry returned unexpected status ${response.status} for ${expected.name}@${expected.version}.`
    );
  }

  await dependencies.runCommand("pnpm", ["exec", "changeset", "git-tag"]);
  await reconcileChangesetsOutput(dependencies.changesetsOutputPath, expected);
};

const runCommand: ReleaseCommandRunner = (command, arguments_) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...arguments_], {
      shell: false,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const outcome =
        signal === null ? `exit code ${code}` : `signal ${signal}`;
      reject(new Error(`${command} failed with ${outcome}.`));
    });
  });

const main = async (): Promise<void> => {
  const packageJson = JSON.parse(
    await readFile("package.json", "utf8")
  ) as unknown;
  const changesetsOutputPath = process.env.CHANGESETS_OUTPUT;
  await publishRelease(validateIdentity(packageJson, "package.json"), {
    ...(changesetsOutputPath === undefined ? {} : { changesetsOutputPath }),
    fetchVersion: fetch,
    runCommand,
  });
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
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
