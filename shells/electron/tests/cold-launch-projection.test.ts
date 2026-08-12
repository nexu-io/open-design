import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  packagedColdLaunchProjectionPath,
  projectPackagedColdLaunchConfig,
  readPackagedColdLaunchProjection,
  writePackagedColdLaunchProjection,
} from "../src/cold-launch-projection.js";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("packaged mac cold-launch projection", () => {
  it("keeps only caller-owned namespace routing", () => {
    const namespaceBaseRoot = join("tmp", "open-design", "namespaces");
    expect(projectPackagedColdLaunchConfig({
      namespace: " release-beta-x64 ",
      namespaceBaseRoot,
    })).toEqual({
      namespace: "release-beta-x64",
      namespaceBaseRoot: resolve(namespaceBaseRoot),
      schemaVersion: 1,
    });
    expect(projectPackagedColdLaunchConfig({ namespace: "release-beta-x64" })).toBeNull();
  });

  it("persists a projection for a later OS launch", async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), "od-electron-cold-launch-"));
    roots.push(userDataRoot);
    const projection = projectPackagedColdLaunchConfig({
      namespace: "release-beta-x64",
      namespaceBaseRoot: join(userDataRoot, "runtime", "namespaces"),
    });
    if (projection == null) throw new Error("expected projection");

    await writePackagedColdLaunchProjection(userDataRoot, projection);

    expect(await readPackagedColdLaunchProjection(userDataRoot)).toEqual(projection);
    expect(JSON.parse(await readFile(packagedColdLaunchProjectionPath(userDataRoot), "utf8"))).toEqual(projection);
  });

  it("fails a malformed or missing projection closed", async () => {
    const userDataRoot = await mkdtemp(join(tmpdir(), "od-electron-cold-launch-"));
    roots.push(userDataRoot);
    expect(await readPackagedColdLaunchProjection(userDataRoot)).toBeNull();
  });
});
