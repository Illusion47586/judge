import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

interface PackageManifest {
  devDependencies: Record<string, string>;
  exports: Record<string, { import: string; types: string }>;
  main?: string;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional: boolean }>;
  types: string;
}

const OPTIONAL_INTEGRATIONS = ["@ai-sdk/gateway", "ai", "cloudflare"] as const;

const manifest = JSON.parse(
  readFileSync("package.json", "utf8")
) as PackageManifest;

test("publishes optional integrations without required runtime peers", () => {
  assert.equal(manifest.main, "./dist/index.js");
  assert.equal(manifest.peerDependencies, undefined);

  for (const dependency of OPTIONAL_INTEGRATIONS) {
    assert.ok(manifest.devDependencies[dependency]);
    assert.deepEqual(manifest.peerDependenciesMeta[dependency], {
      optional: true,
    });
  }
});

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

  const exportTargets = Object.values(manifest.exports).flatMap((entry) => [
    entry.import,
    entry.types,
  ]);
  const publishedTargets = new Set([
    manifest.main,
    manifest.types,
    ...exportTargets,
  ]);
  for (const target of publishedTargets) {
    assert.ok(target);
    readFileSync(target.slice(2));
  }
});
