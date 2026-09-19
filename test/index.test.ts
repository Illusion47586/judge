import assert from "node:assert/strict";
import test from "node:test";

test("the Judge TypeScript entry point loads in Node", async () => {
  const judge = await import("../src/index.ts");

  assert.equal(typeof judge.createJudge, "function");
  assert.equal(typeof judge.ConfigurationError, "function");
});
