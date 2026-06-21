import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";

import {
  assertFreshToolBuild,
  type ToolBuildMetadataPolicy,
  writeToolBuildMetadata,
} from "../src/index.ts";

function policyFor(name: string): ToolBuildMetadataPolicy {
  return {
    buildCommand: `pnpm --filter @open-design/${name} build`,
    distEntries: ["dist/index.mjs"],
    inputs: ["src", "package.json", "esbuild.config.mjs", "tsconfig.json"],
    packageName: `@open-design/${name}`,
    toolName: name,
  };
}

async function createToolFixture(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `open-design-${name}-`));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ name, private: true }, null, 2), "utf8");
  await writeFile(join(root, "esbuild.config.mjs"), "export default {};\n", "utf8");
  await writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { module: "NodeNext" } }, null, 2), "utf8");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "index.mjs"), "export {};\n", "utf8");
  return root;
}

test("writeToolBuildMetadata writes the expected build hash shape", async () => {
  const toolRoot = await createToolFixture("tools-dev");
  const policy = policyFor("tools-dev");
  try {
    const { hash, metadataPath } = await writeToolBuildMetadata(policy, toolRoot);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    assert.deepEqual(metadata, { build: { hash } });
    await assert.doesNotReject(assertFreshToolBuild(policy, toolRoot));
  } finally {
    await rm(toolRoot, { force: true, recursive: true });
  }
});

test("assertFreshToolBuild fails when source hash drifts from dist metadata", async () => {
  const toolRoot = await createToolFixture("tools-serve");
  const policy = policyFor("tools-serve");
  try {
    await writeToolBuildMetadata(policy, toolRoot);
    await writeFile(join(toolRoot, "src", "index.ts"), "export const value = 2;\n", "utf8");
    await assert.rejects(
      assertFreshToolBuild(policy, toolRoot),
      /build metadata hash mismatch/,
    );
  } finally {
    await rm(toolRoot, { force: true, recursive: true });
  }
});
