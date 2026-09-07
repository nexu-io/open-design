import { join } from "node:path";
import { expect, it } from "vitest";
import { resolveElectronSceneResourceFiles } from "@/distribution/distribution.js";

it("maps every verified native file explicitly instead of using a filtered directory glob", () => {
  const files = ["bin/node", "node_modules/better-sqlite3/build/Release/better_sqlite3.node", "node_modules/.package-lock.json", "NODE-LICENSE", "empty"];
  const resources = resolveElectronSceneResourceFiles([
    { name: "host.mjs", path: "/scene/host.mjs", sha256: "a".repeat(64), size: 1 },
    { name: "platform", path: "/scene/platform", sha256: "b".repeat(64), size: 5,
      tree: files.map(path => ({ path, size: 1, sha256: "c".repeat(64), mode: 0o755 })) },
  ]);
  expect(resources).toEqual([
    { from: "/scene/host.mjs", to: "host.mjs" },
    ...files.map(path => ({ from: join("/scene/platform", path), to: `platform/${path}` })),
  ]);
  expect(resources.some(file => file.from === "/scene/platform")).toBe(false);
});
