import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertPackagedSidecarRuntime, finalizeRuntimeManifest } from "@/resources/runtime-manifest.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-runtime-manifest-"));
  const app = join(root, "app");
  const pkg = join(app, "node_modules/@open-design/sidecar");
  await mkdir(pkg, { recursive: true });
  const manifest = { name:"open-design-packaged-app", version:"0.22.2", main:"./main.cjs", private:true,
    dependencies:{ "@open-design/sidecar":"file:../../tarballs/sidecar.tgz", "node-pty":"1.1.0" },
    optionalDependencies:{ "fsevents":"2.3.3" } };
  await writeFile(join(app, "package.json"), JSON.stringify(manifest));
  await writeFile(join(pkg, "package.json"), JSON.stringify({name:"@open-design/sidecar", version:"0.22.1"}));
  return {root, app, pkg, manifest};
}

describe("runtime manifest finalization", () => {
  it("keeps dependency collection inputs but replaces build-only tarballs with installed versions", async () => {
    const f = await fixture();
    try {
      await finalizeRuntimeManifest(f.app);
      expect(JSON.parse(await readFile(join(f.app, "package.json"), "utf8"))).toEqual({
        ...f.manifest, dependencies:{ ...f.manifest.dependencies, "@open-design/sidecar":"0.22.1" },
      });
      const once = await readFile(join(f.app, "package.json"), "utf8");
      await finalizeRuntimeManifest(f.app);
      expect(await readFile(join(f.app, "package.json"), "utf8")).toBe(once);
    } finally { await rm(f.root, {recursive:true, force:true}); }
  });
  it("retains runtime packages in electron-builder's real traversal collector", async () => {
    const f = await fixture();
    try {
      const require = createRequire(import.meta.url);
      const builderRequire = createRequire(require.resolve("electron-builder"));
      const libRequire = createRequire(builderRequire.resolve("app-builder-lib"));
      const { getCollectorByPackageManager, PM } = libRequire("./node-module-collector/index.js");
      const pty = join(f.app, "node_modules/node-pty");
      await mkdir(pty);
      await writeFile(join(pty, "package.json"), JSON.stringify({name:"node-pty",version:"1.1.0"}));
      await finalizeRuntimeManifest(f.app);
      let sequence = 0;
      const collector = getCollectorByPackageManager(PM.TRAVERSAL, f.app, {
        getTempFile: async () => join(f.root, `collector-${sequence++}.json`),
      });
      const result = await collector.getNodeModules({packageName:f.manifest.name}) as {
        nodeModules: Array<{name:string; version:string}>;
      };
      expect(result.nodeModules.map(({name,version}) => ({name,version}))).toEqual([
        {name:"@open-design/sidecar",version:"0.22.1"}, {name:"node-pty",version:"1.1.0"},
      ]);
    } finally { await rm(f.root, {recursive:true, force:true}); }
  });

  it.each(["healthy", "supervisor", "platform", "entry", "manifest"])("validates collected runtime: %s", async (failure) => {
    const f = await fixture();
    try {
      await mkdir(join(f.pkg, "dist"));
      await writeFile(join(f.pkg, "package.json"), JSON.stringify({name:"@open-design/sidecar",version:"0.22.1",main:"dist/index.mjs"}));
      await writeFile(join(f.pkg, "dist/index.mjs"), "export {};");
      await writeFile(join(f.pkg, "dist/supervisor.mjs"), "export {};");
      const platform = join(f.app, "node_modules/@open-design/platform");
      await mkdir(platform);
      await writeFile(join(platform, "package.json"), JSON.stringify({name:"@open-design/platform",main:"index.mjs"}));
      await writeFile(join(platform, "index.mjs"), "export {};");
      await writeFile(join(f.app, "main.cjs"), "");
      if (failure !== "manifest") await finalizeRuntimeManifest(f.app);
      if (failure === "supervisor") await rm(join(f.pkg, "dist/supervisor.mjs"));
      if (failure === "platform") await rm(join(platform, "index.mjs"));
      if (failure === "entry") await rm(join(f.app, "main.cjs"));
      const result = assertPackagedSidecarRuntime(f.app, ["main.cjs"]);
      if (failure === "healthy") await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toThrow();
    } finally { await rm(f.root, {recursive:true, force:true}); }
  });

  it.each(["missing", "identity", "escape"])("rejects %s installed dependency before rewriting the manifest", async (failure) => {
    const f = await fixture();
    try {
      const before = await readFile(join(f.app, "package.json"), "utf8");
      if (failure === "missing") await rm(join(f.pkg, "package.json"));
      if (failure === "identity") await writeFile(join(f.pkg, "package.json"), JSON.stringify({name:"other",version:"1.0.0"}));
      if (failure === "escape") {
        await rm(f.pkg, {recursive:true});
        const outside = join(f.root, "outside");
        await mkdir(outside);
        await writeFile(join(outside, "package.json"), JSON.stringify({name:"@open-design/sidecar",version:"0.22.1"}));
        await symlink(outside, f.pkg, "junction");
      }
      await expect(finalizeRuntimeManifest(f.app)).rejects.toThrow();
      expect(await readFile(join(f.app, "package.json"), "utf8")).toBe(before);
    } finally { await rm(f.root, {recursive:true, force:true}); }
  });
});
