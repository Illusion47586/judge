import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const envRule = /^\.env$/mu;
const envVariantsRule = /^\.env\.\*$/mu;
const envExampleException = /^!\.env\.example$/mu;
const sharedHarnessImport = /from "\.\/_shared\.ts"/u;
const evaluationCall = /\bjudge\.(?:boolean|if|choice|switch|score)\s*\(/gu;

const exampleFiles = [
  "examples/01-boolean.ts",
  "examples/02-if.ts",
  "examples/03-choice.ts",
  "examples/04-switch.ts",
  "examples/05-score.ts",
  "examples/06-support-triage.ts",
  "examples/07-transaction-risk.ts",
  "examples/08-incident-escalation.ts",
  "examples/09-agent-tool-routing.ts",
] as const;

test("example credentials stay out of Git", () => {
  const gitignore = readFileSync(".gitignore", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(gitignore, envRule);
  assert.match(gitignore, envVariantsRule);
  assert.match(gitignore, envExampleException);
  assert.equal(envExample, "AI_GATEWAY_API_KEY=\n");
});

test("every numbered example uses the shared harness exactly once", () => {
  for (const file of exampleFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(source, sharedHarnessImport);
    assert.equal([...source.matchAll(evaluationCall)].length, 1, file);
  }
});
