import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const envRule = /^\.env$/mu;
const envVariantsRule = /^\.env\.\*$/mu;
const envExampleException = /^!\.env\.example$/mu;

test("example credentials stay out of Git", () => {
  const gitignore = readFileSync(".gitignore", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(gitignore, envRule);
  assert.match(gitignore, envVariantsRule);
  assert.match(gitignore, envExampleException);
  assert.equal(envExample, "AI_GATEWAY_API_KEY=\n");
});
