import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { exportReleaseDistribution } from "@/exact/distribution-artifact.ts";
import { describeFile } from "@/exact/control-common.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "distribution-transport-")); roots.push(root);
  const source = join(root, "build"), output = join(root, "transport");
  await mkdir(source);
  const installer = join(source, "installer.dmg"); await writeFile(installer, "signed installer");
  const contribution = { artifact: await describeFile(installer), platformTrust: { mode: "formal" } };
  await writeFile(join(source, "shell-contribution.json"), JSON.stringify(contribution));
  await mkdir(join(source, "mac-arm64"));
  await writeFile(join(source, "builder-debug.yml"), "unused");
  return { source, output, installer, contribution };
}
it("transports only the bound installer and unchanged contribution, retaining native intermediates", async () => {
  const f = await fixture(); await exportReleaseDistribution(f);
  expect((await readdir(f.output)).sort()).toEqual(["installer.dmg", "shell-contribution.json"]);
  expect(JSON.parse(await readFile(join(f.output, "shell-contribution.json"), "utf8"))).toEqual(f.contribution);
  expect(await readFile(join(f.output, "installer.dmg"), "utf8")).toBe("signed installer");
  expect(await readdir(f.source)).toContain("mac-arm64");
  await expect(exportReleaseDistribution(f)).rejects.toThrow();
});
it("fails before staging when installer bytes do not match the contribution", async () => {
  const f = await fixture(); await writeFile(f.installer, "corrupt");
  await expect(exportReleaseDistribution(f)).rejects.toThrow("binding verification failed");
  await expect(readdir(f.output)).rejects.toThrow();
});
