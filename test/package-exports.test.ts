import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("builds independent ESM entry points", async () => {
  execFileSync("pnpm", ["build"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  const load = (relativePath: string): Promise<Record<string, unknown>> =>
    import(new URL(relativePath, import.meta.url).href);
  const root = await load("../dist/index.js");
  const core = await load("../dist/core/index.js");
  const custom = await load("../dist/gateway/custom.js");
  const vercel = await load("../dist/gateway/vercel.js");
  const cloudflare = await load("../dist/gateway/cloudflare.js");
  const openrouter = await load("../dist/gateway/openrouter.js");
  const mock = await load("../dist/mock/index.js");

  assert.equal(typeof root.createJudge, "function");
  assert.equal(typeof core.createJudge, "function");
  assert.equal(typeof core.ConfigurationError, "function");
  assert.equal(typeof custom.defineGateway, "function");
  assert.equal(typeof vercel.vercelGateway, "function");
  assert.equal(typeof cloudflare.cloudflareGateway, "function");
  assert.equal(typeof openrouter.openRouterGateway, "function");
  assert.equal(typeof mock.mockProvider, "function");
});
