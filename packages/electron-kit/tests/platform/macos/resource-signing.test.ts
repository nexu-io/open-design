import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { inspectMacSigningResources, macResourceSigningPattern } from "@/platform/macos/resource-signing.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "resource-signing-")); roots.push(root);
  const app = join(root, "Example+[test].app");
  await mkdir(join(app, "Contents"), { recursive: true });
  return app;
}
async function file(app: string, relative: string, contents: Buffer) {
  const path = join(app, "Contents", relative);
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, contents);
  return path;
}

it("seals only data packs in this application's resource directories", async () => {
  const app = await fixture(), pattern = new RegExp(macResourceSigningPattern(app));
  const header = Buffer.alloc(12); header.writeUInt32LE(5);
  const resource = await file(app, "Frameworks/Electron Framework.framework/Versions/A/Resources/en.lproj/locale.pak", header);
  expect(pattern.test(resource)).toBe(true);
  expect(pattern.test(join(app, "Contents/Resources/resources.pak"))).toBe(true);
  for (const path of ["MacOS/code.pak", "Resources/app.asar", "Resources/native.node", "Frameworks/code.dylib", "Resources/Helper.app"]) {
    expect(pattern.test(join(app, "Contents", path))).toBe(false);
  }
  expect(pattern.test(resource.replace("Example+[test].app", "Other.app"))).toBe(false);
  await symlink("A", join(app, "Contents/Frameworks/Electron Framework.framework/Versions/Current"));
  expect(await inspectMacSigningResources(app)).toBe(1);
});

it.each([Buffer.from("cffaedfe0000000000000000", "hex"), Buffer.from("MZexecutable"), Buffer.from([5])])(
  "rejects executable or truncated files disguised as data packs (%s)", async contents => {
    const app = await fixture(); await file(app, "Resources/renamed.pak", contents);
    await expect(inspectMacSigningResources(app)).rejects.toThrow("invalid Chromium signing resource");
  },
);
