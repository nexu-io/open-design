import { open, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inheritedAppImageLockFds } from "../src/appimage-lock.js";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    await rm(roots.pop()!, { force: true, recursive: true });
  }
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-packaged-appimage-lock-"));
  roots.push(root);
  return root;
}

describe("inheritedAppImageLockFds", () => {
  it("returns the descriptor named by OD_APPIMAGE_LOCK_FD when it is open", async () => {
    const root = await createTempRoot();
    const file = await open(join(root, "launch.lock"), "w");
    try {
      expect(inheritedAppImageLockFds({ OD_APPIMAGE_LOCK_FD: String(file.fd) })).toEqual([file.fd]);
    } finally {
      await file.close();
    }
  });

  it("ignores missing, malformed, and stdio descriptors", async () => {
    expect(inheritedAppImageLockFds({})).toEqual([]);
    expect(inheritedAppImageLockFds({ OD_APPIMAGE_LOCK_FD: "" })).toEqual([]);
    expect(inheritedAppImageLockFds({ OD_APPIMAGE_LOCK_FD: "8x" })).toEqual([]);
    expect(inheritedAppImageLockFds({ OD_APPIMAGE_LOCK_FD: "-1" })).toEqual([]);
    expect(inheritedAppImageLockFds({ OD_APPIMAGE_LOCK_FD: "1" })).toEqual([]);
    expect(inheritedAppImageLockFds({ OD_APPIMAGE_LOCK_FD: "2" })).toEqual([]);
  });

  it("ignores a descriptor this process did not inherit", async () => {
    const root = await createTempRoot();
    const file = await open(join(root, "launch.lock"), "w");
    const fd = file.fd;
    await file.close();
    expect(inheritedAppImageLockFds({ OD_APPIMAGE_LOCK_FD: String(fd) })).toEqual([]);
  });
});
