import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ElectronActivationAttempt } from "@/runtime/activation.js";

describe("Electron activation commit", () => {
  it("distinguishes startup failure from committed and stopped runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-activation-"));
    try {
      const failed = await ElectronActivationAttempt.begin(root);
      await failed.fail(Object.assign(new Error("fixture failed"), { code: "fixture-startup" }));
      expect(JSON.parse(await readFile(join(root, "activation.json"), "utf8"))).toMatchObject({ state: "failed", error: { code: "fixture-startup" } });
      const running = await ElectronActivationAttempt.begin(root);
      await running.commit();
      await running.stop();
      expect(JSON.parse(await readFile(join(root, "activation.json"), "utf8"))).toMatchObject({ state: "stopped", previousAttempt: { state: "failed" } });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
