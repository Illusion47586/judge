import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
  await publishRelease(validateIdentity(packageJson, "package.json"), {
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
