import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { listArchive, readTarEntry } from "@open-design/download";
import {
  exportReleaseExecutorProduct,
  pnpmInvocation,
  releaseExecutorManifest,
} from "@/executor/product.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "release-executor-product-"));
  roots.push(root);
  return root;
}

describe("release executor product", () => {
  it("runs the pnpm script through Node when deploying on Windows", () => {
    expect(pnpmInvocation("win32", "C:\\pnpm\\pnpm.cjs")).toEqual({
      args: ["C:\\pnpm\\pnpm.cjs"],
      command: process.execPath,
    });
    expect(() => pnpmInvocation("win32", "")).toThrow("requires npm_execpath");
    expect(pnpmInvocation("darwin")).toEqual({ args: [], command: "pnpm" });
    expect(pnpmInvocation("linux")).toEqual({ args: [], command: "pnpm" });
  });

  it("exports one reproducible platform contract without command links", async () => {
    const root = await fixture();
    const archive = join(root, "product", "workspace.tar.gz");
    const runDeploy = async (_packageName: string, destination: string) => {
      await mkdir(join(destination, "dist"), { recursive: true });
      await mkdir(join(destination, "node_modules", ".bin"), { recursive: true });
      await writeFile(join(destination, "dist", "index.mjs"), "export {};\n");
      await symlink(join(destination, "dist", "index.mjs"), join(destination, "node_modules", ".bin", "tool"));
    };
    const copyRelease = async (destination: string) => {
      await mkdir(join(destination, "dist"), { recursive: true });
      await writeFile(join(destination, "dist", "index.mjs"), "export {};\n");
    };

    const result = await exportReleaseExecutorProduct({ copyRelease, output: archive, runDeploy });
    expect(result.manifest).toEqual(releaseExecutorManifest());
    expect(result.bytes).toBeGreaterThan(0);
    expect(listArchive(archive, "tar.gz")).toContain("manifest.json");
    expect(listArchive(archive, "tar.gz").some((entry) => entry.includes("/.bin/"))).toBe(false);
    expect(JSON.parse(readTarEntry(archive, "manifest.json"))).toEqual(result.manifest);
  });

  it("rejects a deploy tree with links outside the product root", async () => {
    const root = await fixture();
    const runDeploy = async (_packageName: string, destination: string) => {
      await mkdir(join(destination, "dist"), { recursive: true });
      await writeFile(join(destination, "dist", "index.mjs"), "export {};\n");
      await symlink(process.execPath, join(destination, "unsafe-link"));
    };
    const copyRelease = async (destination: string) => {
      await mkdir(join(destination, "dist"), { recursive: true });
      await writeFile(join(destination, "dist", "index.mjs"), "export {};\n");
    };
    await expect(exportReleaseExecutorProduct({
      copyRelease,
      output: join(root, "workspace.tar.gz"),
      runDeploy,
    })).rejects.toThrow("link escapes its root");
  });

  it("requires the current platform execution class", async () => {
    const root = await fixture();
    await expect(exportReleaseExecutorProduct({
      arch: "impossible" as NodeJS.Architecture,
      output: join(root, "workspace.tar.gz"),
      runDeploy: async () => {},
    })).rejects.toThrow("differs from host");
  });
});
