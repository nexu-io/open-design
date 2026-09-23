import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createTarArchive } from "@open-design/download";
import type { ToolPackConfig } from "@/config/index.js";
import {
  macRuntimeProductManifest,
  restoreMacRuntimeProduct,
} from "@/mac/runtime-product.js";
import { resolveMacPrebundleResolverTarballs } from "@/mac/app.js";
import type { MacPaths } from "@/mac/types.js";

const roots: string[] = [];
const config = { electronVersion: "41.3.0" } as ToolPackConfig;

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mac-runtime-product-test-"));
  roots.push(root);
  return root;
}

async function product(root: string, manifest = macRuntimeProductManifest(config)): Promise<string> {
  const stage = join(root, "stage");
  await mkdir(join(stage, "node_modules", "dependency"), { recursive: true });
  await writeFile(join(stage, "app-package.json"), JSON.stringify({
    dependencies: { dependency: "1.0.0" },
    name: "open-design-packaged-app",
  }));
  await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(stage, "node_modules", "dependency", "package.json"), JSON.stringify({ name: "dependency", version: "1.0.0" }));
  const archive = join(root, "workspace.tar.gz");
  createTarArchive(archive, [{ directory: stage, entries: ["app-package.json", "manifest.json", "node_modules"] }], {
    dereference: false,
    reproducible: true,
  });
  return archive;
}

describe("mac runtime product", () => {
  it("declares the prebundle closure protocol separately from an app version", () => {
    expect(macRuntimeProductManifest(config)).toEqual({
      arch: process.arch,
      electronVersion: "41.3.0",
      platform: "darwin",
      protocol: "open-design-mac-runtime-v2",
      schemaVersion: 2,
    });
  });

  it("selects the complete internal resolver closure from packed products", () => {
    const paths = { tarballsRoot: "/products/tarballs" } as MacPaths;
    expect(resolveMacPrebundleResolverTarballs(paths, [
      { fileName: "daemon.tgz", packageName: "@open-design/daemon" },
      { fileName: "launcher.tgz", packageName: "@open-design/launcher-proto" },
      { fileName: "sidecar.tgz", packageName: "@open-design/sidecar-proto" },
      { fileName: "release.tgz", packageName: "@open-design/release" },
    ])).toEqual([
      "/products/tarballs/daemon.tgz",
      "/products/tarballs/launcher.tgz",
      "/products/tarballs/sidecar.tgz",
    ]);
  });

  it("restores a version-neutral product for the exact platform ABI", async () => {
    const root = await fixture();
    const output = join(root, "restored");
    const result = await restoreMacRuntimeProduct(config, { archive: await product(root), output });
    expect(result.manifest).toEqual(macRuntimeProductManifest(config));
    expect(JSON.parse(await readFile(join(output, "app-package.json"), "utf8"))).toMatchObject({
      dependencies: { dependency: "1.0.0" },
    });
  });

  it("quick-fails a product for another Electron ABI", async () => {
    const root = await fixture();
    const incompatible = { ...macRuntimeProductManifest(config), electronVersion: "40.0.0" };
    await expect(restoreMacRuntimeProduct(config, {
      archive: await product(root, incompatible),
      output: join(root, "restored"),
    })).rejects.toThrow("incompatible mac runtime product");
  });
});
