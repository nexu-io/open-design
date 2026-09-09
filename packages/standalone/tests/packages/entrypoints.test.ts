import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("keeps the public physical runtime entry independent of builders and product code", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../../src/packages/index.ts", import.meta.url))],
    bundle: true, write: false, metafile: true, platform: "node", format: "esm", target: "node24",
  });
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.some(path => path.endsWith("packages/runtime.ts"))).toBe(true);
  expect(inputs.some(path => /(?:node_modules|electron-kit|shells)\//u.test(path))).toBe(false);
  expect(inputs.some(path => /packages\/(?:build|node)\.ts$/u.test(path))).toBe(false);
  expect(inputs.some(path => /packages\/(?:resource|resource-build)\.ts$/u.test(path))).toBe(false);
  const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports);
  expect(imports.every(item => item.external && builtinModules.includes(item.path.replace(/^node:/u, "")))).toBe(true);
});

it("isolates platform acquisition from native builders and product composition", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../../src/packages/resource.ts", import.meta.url))],
    bundle: true, write: false, metafile: true, platform: "node", format: "esm", target: "node24",
  });
  const inputs = Object.keys(result.metafile.inputs);
  expect(inputs.some(path => path.endsWith("src/blob.ts"))).toBe(true);
  expect(inputs.some(path => /packages\/(?:build|node|resource-build)\.ts$/u.test(path))).toBe(false);
  expect(inputs.some(path => /(?:electron-kit|shells|apps)\//u.test(path))).toBe(false);
});

it("keeps physical package methods outside the Closure-consumed root entry", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../../src/index.ts", import.meta.url))],
    bundle: true, write: false, metafile: true, platform: "node", format: "esm", target: "node24",
  });
  expect(Object.keys(result.metafile.inputs).some(path => /src\/packages\//u.test(path))).toBe(false);
});
