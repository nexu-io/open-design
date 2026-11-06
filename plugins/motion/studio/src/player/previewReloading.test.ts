// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import {
  giveUpOnPreviewChange,
  isPreviewChanging,
  previewReloadBegun,
  requestPreviewReload,
  setPreviewReloading,
  whileScriptWrites,
} from "./previewReloading";

afterEach(() => {
  previewReloadBegun();
  setPreviewReloading(false);
});

describe("the preview is changing", () => {
  it("from a script write's send until it lands", async () => {
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    expect(isPreviewChanging()).toBe(true);
    land();
    await write;
    expect(isPreviewChanging()).toBe(false);
  });

  it("until a write that fails gives up, so a press never hangs on it", async () => {
    await expect(whileScriptWrites(() => Promise.reject(new Error("rejected")))).rejects.toThrow();
    expect(isPreviewChanging()).toBe(false);
  });

  it("from a reload's request until it has begun", () => {
    requestPreviewReload();
    expect(isPreviewChanging()).toBe(true);
    previewReloadBegun();
    expect(isPreviewChanging()).toBe(false);
  });

  it("stops counting a change a press gave up on, until the preview goes idle", async () => {
    let land: () => void = () => {};
    const stuck = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    giveUpOnPreviewChange();
    expect(isPreviewChanging()).toBe(false);
    land();
    await stuck;
    requestPreviewReload();
    expect(isPreviewChanging(), "the next change counts again").toBe(true);
  });

  it("is mirrored on the page for a tool that watches the preview from outside", async () => {
    const shown = () => document.documentElement.hasAttribute("data-preview-changing");
    expect(shown()).toBe(false);
    requestPreviewReload();
    expect(shown()).toBe(true);
    previewReloadBegun();
    expect(shown()).toBe(false);
    let land: () => void = () => {};
    const write = whileScriptWrites(() => new Promise<void>((resolve) => (land = resolve)));
    expect(shown()).toBe(true);
    land();
    await write;
    expect(shown()).toBe(false);
  });
});
