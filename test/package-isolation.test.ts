import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

const importPattern = /(?:from\s+|import\s*)["']([^"']+)["']/gu;

const moduleGraph = (entry: string): string => {
  const pending = [entry];
  const visited = new Set<string>();
  const contents: string[] = [];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) {
      continue;
    }
    visited.add(file);
    const source = readFileSync(file, "utf8");
    contents.push(`${file}\n${source}`);
    for (const match of source.matchAll(importPattern)) {
      const [, specifier] = match;
      if (specifier?.startsWith(".")) {
        const dependency = resolve(dirname(file), specifier);
        if (existsSync(dependency)) {
          pending.push(dependency);
        }
      } else if (specifier) {
        contents.push(specifier);
      }
    }
  }

  return contents.join("\n");
};

test("emitted entry-point graphs preserve integration boundaries", () => {
  execFileSync("pnpm", ["build"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  const dist = resolve(process.cwd(), "dist");
  const boundaries = {
    cloudflare: ["@ai-sdk", "openrouter"],
    core: ["/provider/jev", "/gateway/", "cloudflare", "@ai-sdk", "openrouter"],
    custom: ["cloudflare", "@ai-sdk", "openrouter"],
    openrouter: ["cloudflare", "@ai-sdk"],
    root: ["cloudflare", "@ai-sdk/gateway", "@openrouter/sdk"],
    vercel: ["cloudflare", "openrouter"],
  } as const;
  const entries = {
    cloudflare: resolve(dist, "gateway/cloudflare.js"),
    core: resolve(dist, "core/index.js"),
    custom: resolve(dist, "gateway/custom.js"),
    openrouter: resolve(dist, "gateway/openrouter.js"),
    root: resolve(dist, "index.js"),
    vercel: resolve(dist, "gateway/vercel.js"),
  } as const;

  for (const name of Object.keys(entries) as (keyof typeof entries)[]) {
    const graph = moduleGraph(entries[name]).toLowerCase();
    for (const forbidden of boundaries[name]) {
      assert.equal(
        graph.includes(forbidden.toLowerCase()),
        false,
        `${name} graph contains forbidden dependency ${forbidden}`
      );
    }
    assert.equal(
      graph.includes("/mock/"),
      false,
      `${name} graph contains mock`
    );
  }
});
