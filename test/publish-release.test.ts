import assert from "node:assert/strict";
import test from "node:test";

import {
  publishRelease,
  type ReleaseCommandRunner,
} from "../scripts/publish-release.ts";

const PACKAGE = { name: "@brkn-labs/judge", version: "1.2.3" } as const;
const VERSION_URL = "https://registry.npmjs.org/@brkn-labs%2Fjudge/1.2.3";
const METADATA_MISMATCH = /registry metadata did not match/u;
const MALFORMED_METADATA = /registry metadata must contain/u;
const UNEXPECTED_STATUS = /unexpected status 503/u;
const NETWORK_UNAVAILABLE = /network unavailable/u;
const PUBLISH_FAILED = /publish failed/u;

const recordingRunner = () => {
  const calls: Array<{ command: string; arguments_: readonly string[] }> = [];
  const runCommand: ReleaseCommandRunner = (command, arguments_) => {
    calls.push({ arguments_, command });
    return Promise.resolve();
  };

  return { calls, runCommand };
};

test("publishes an absent exact version, then emits Changesets output", async () => {
  const { calls, runCommand } = recordingRunner();
  const fetchVersion: typeof fetch = (input) => {
    assert.equal(input, VERSION_URL);
    return Promise.resolve(new Response(null, { status: 404 }));
  };

  await publishRelease(PACKAGE, { fetchVersion, runCommand });

  assert.deepEqual(calls, [
    { arguments_: ["publish", "--ignore-scripts"], command: "npm" },
    {
      arguments_: ["exec", "changeset", "git-tag"],
      command: "pnpm",
    },
  ]);
});

test("an exact existing version skips upload and still emits Changesets output", async () => {
  const { calls, runCommand } = recordingRunner();
  const fetchVersion: typeof fetch = (input) => {
    assert.equal(input, VERSION_URL);
    return Promise.resolve(Response.json(PACKAGE));
  };

  await publishRelease(PACKAGE, { fetchVersion, runCommand });

  assert.deepEqual(calls, [
    {
      arguments_: ["exec", "changeset", "git-tag"],
      command: "pnpm",
    },
  ]);
});

test("mismatched registry metadata fails closed without running commands", async () => {
  const { calls, runCommand } = recordingRunner();
  const fetchVersion: typeof fetch = () =>
    Promise.resolve(Response.json({ name: PACKAGE.name, version: "9.9.9" }));

  await assert.rejects(
    publishRelease(PACKAGE, { fetchVersion, runCommand }),
    METADATA_MISMATCH
  );
  assert.deepEqual(calls, []);
});

test("malformed registry metadata fails closed without running commands", async () => {
  const { calls, runCommand } = recordingRunner();
  const fetchVersion: typeof fetch = () =>
    Promise.resolve(Response.json({ name: PACKAGE.name }));

  await assert.rejects(
    publishRelease(PACKAGE, { fetchVersion, runCommand }),
    MALFORMED_METADATA
  );
  assert.deepEqual(calls, []);
});

test("unexpected registry responses fail closed without running commands", async () => {
  const { calls, runCommand } = recordingRunner();
  const fetchVersion: typeof fetch = () =>
    Promise.resolve(new Response(null, { status: 503 }));

  await assert.rejects(
    publishRelease(PACKAGE, { fetchVersion, runCommand }),
    UNEXPECTED_STATUS
  );
  assert.deepEqual(calls, []);
});

test("registry network failures fail closed without running commands", async () => {
  const { calls, runCommand } = recordingRunner();
  const fetchVersion: typeof fetch = () =>
    Promise.reject(new Error("network unavailable"));

  await assert.rejects(
    publishRelease(PACKAGE, { fetchVersion, runCommand }),
    NETWORK_UNAVAILABLE
  );
  assert.deepEqual(calls, []);
});

test("a failed upload never creates a tag", async () => {
  const calls: Array<{ command: string; arguments_: readonly string[] }> = [];
  const fetchVersion: typeof fetch = () =>
    Promise.resolve(new Response(null, { status: 404 }));
  const runCommand: ReleaseCommandRunner = (command, arguments_) => {
    calls.push({ arguments_, command });
    if (command === "npm") {
      return Promise.reject(new Error("publish failed"));
    }
    return Promise.resolve();
  };

  await assert.rejects(
    publishRelease(PACKAGE, { fetchVersion, runCommand }),
    PUBLISH_FAILED
  );
  assert.deepEqual(calls, [
    { arguments_: ["publish", "--ignore-scripts"], command: "npm" },
  ]);
});
