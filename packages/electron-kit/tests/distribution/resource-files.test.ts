import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { resolveElectronDistributionResourceFiles } from "@/distribution/distribution.js";

it("projects only explicit installation files, excluding adjacent scene payloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "distribution-resources-"));
  try {
    const capsule = join(root, "capsule.zip");
    await writeFile(capsule, "current Capsule");
    await writeFile(join(root, "closure.zip"), "not installed");
    await mkdir(join(root, "platform"));
    expect(await resolveElectronDistributionResourceFiles([{ name: "capsule.zip", path: capsule }]))
      .toEqual([{ from: capsule, to: "capsule.zip" }]);
    await expect(resolveElectronDistributionResourceFiles([{ name: "platform", path: join(root, "platform") }]))
      .rejects.toThrow("regular file");
    const link = join(root, "linked.zip");
    await symlink(capsule, link);
    await expect(resolveElectronDistributionResourceFiles([{ name: "linked.zip", path: link }]))
      .rejects.toThrow("regular file");
    await expect(resolveElectronDistributionResourceFiles([{ name: "../capsule.zip", path: capsule }]))
      .rejects.toThrow("invalid or duplicate");
    await expect(resolveElectronDistributionResourceFiles([{ name: "capsule.zip", path: capsule }, { name: "capsule.zip", path: capsule }]))
      .rejects.toThrow("invalid or duplicate");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
