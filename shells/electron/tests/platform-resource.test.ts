import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { buildElectronPlatformResource } from "@/build-api.ts";

const mock = vi.hoisted(() => ({ helpers: true, archive: vi.fn() }));
vi.mock("@open-design/standalone/packages/build", () => ({
  archiveNodePlatformResource: mock.archive,
  buildNodePlatform: async ({ outputRoot }: { outputRoot: string }) => {
    await mkdir(outputRoot, { recursive: true });
    if (mock.helpers) {
      const path = join(outputRoot, "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper");
      await mkdir(dirname(path), { recursive: true }); await writeFile(path, "helper");
    }
    return { root: outputRoot };
  },
}));
const roots: string[] = [];
afterEach(async () => { mock.helpers = true; vi.clearAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it("exposes resource assembly through the public build API with only product-declared executable grants", async () => {
  const root = await mkdtemp(join(tmpdir(), "electron-platform-resource-")); roots.push(root);
  const outputArchivePath = join(root, "platform.zip");
  await buildElectronPlatformResource({ archivePath: join(root, "node.tar.gz"), target: "darwin-arm64", outputArchivePath });
  expect(mock.archive).toHaveBeenCalledWith({ root: expect.any(String), target: "darwin-arm64", archivePath: outputArchivePath,
    executables: ["bin/node", "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper"] });
});
it("rejects a native package lacking its required PTY helper", async () => {
  mock.helpers = false;
  await expect(buildElectronPlatformResource({ archivePath: "/fixture/node.tar.gz", target: "darwin-arm64", outputArchivePath: "/fixture/platform.zip" }))
    .rejects.toThrow("requires its PTY spawn helper");
  expect(mock.archive).not.toHaveBeenCalled();
});
