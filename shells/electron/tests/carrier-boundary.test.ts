import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps installed release identity out of the independent Capsule content", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/capsule.ts", import.meta.url))],
    bundle: true, external: ["electron"], format: "cjs", platform: "node", target: "node24",
    write: false, metafile: true,
  });
  expect(Object.keys(result.metafile.inputs).filter(path => /(?:^|\/)config\/shell\.json$/u.test(path))).toEqual([]);
  expect(result.outputFiles[0]!.contents.byteLength).toBeGreaterThan(0);
});

it("keeps tool lifecycle code out of every physical Shell bundle", async () => {
  const entries = [
    ["main.ts", "cjs"],
    ["adapters/renderer/preload.ts", "cjs"],
    ["adapters/standalone/host.ts", "esm"],
    ["adapters/standalone/updater-provider.ts", "esm"],
  ] as const;
  for (const [entry, format] of entries) {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(`../src/${entry}`, import.meta.url))],
      bundle: true, external: ["electron"], format, platform: "node", target: "node24",
      write: false, metafile: true,
      plugins: [{ name: "reject-tool-lifecycle-in-carrier", setup(builder) {
        builder.onLoad({ filter: /(?:adapters\/tools\/lifecycle\/|lifecycle-api\.)/ }, () => {
          throw new Error("Carrier must not consume the tool-only lifecycle boundary");
        });
      } }],
    });
    expect(result.outputFiles[0]!.contents.byteLength, entry).toBeGreaterThan(0);
    expect(Object.keys(result.metafile.inputs).some(path => /(?:adapters\/tools\/lifecycle\/|lifecycle-api\.)/u.test(path)), entry).toBe(false);
  }
});
