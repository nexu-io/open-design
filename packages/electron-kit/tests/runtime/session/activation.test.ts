import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ElectronActivationAttempt, inspectElectronStartup } from "@/runtime/session/activation.js";

describe("Electron activation commit", () => {
  it.each(["{", "null", "{}", '{"schemaVersion":1,"attemptId":"old","state":"running","startedAt":"2026-09-08T00:00:00.000Z"}'])("preserves malformed activation bytes instead of treating them as a first launch: %s", async bytes => {
    const root = await mkdtemp(join(tmpdir(), "electron-activation-")), path = join(root, "activation.json");
    try {
      await writeFile(path, bytes);
      await expect(ElectronActivationAttempt.begin(root)).rejects.toThrow();
      expect(await readFile(path, "utf8")).toBe(bytes);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("does not advance in-memory state when its durable commit fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-activation-")), path = join(root, "activation.json");
    try {
      const activation = await ElectronActivationAttempt.begin(root);
      await rm(path); await mkdir(path); await writeFile(join(path, "owned"), "blocks replacement");
      await expect(activation.commit()).rejects.toThrow();
      await rm(path, { recursive: true });
      await activation.commit();
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ state: "running" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("records cancellation that raced a durable commit without claiming startup success", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-activation-"));
    try {
      const activation = await ElectronActivationAttempt.begin(root);
      await activation.commit();
      await activation.fail(new Error("cancelled before startup handoff"));
      const record = JSON.parse(await readFile(join(root, "activation.json"), "utf8"));
      expect(record).toMatchObject({ state: "failed", error: { message: "cancelled before startup handoff" } });
      expect(record).not.toHaveProperty("committedAt");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("distinguishes startup failure from committed and stopped runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-activation-"));
    try {
      const failed = await ElectronActivationAttempt.begin(root);
      await failed.fail(Object.assign(new Error("fixture failed"), { code: "fixture-startup" }));
      expect(JSON.parse(await readFile(join(root, "activation.json"), "utf8"))).toMatchObject({ state: "failed", error: { code: "fixture-startup" } });
      const bytes = await readFile(join(root, "activation.json"), "utf8");
      await expect(ElectronActivationAttempt.begin(root)).rejects.toThrow("explicit exact recovery required");
      expect(await readFile(join(root, "activation.json"), "utf8")).toBe(bytes);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
  it("does not consume an interrupted startup, but permits a new session after a committed stop", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-activation-"));
    try {
      const activation = await ElectronActivationAttempt.begin(root);
      const bytes = await readFile(join(root, "activation.json"), "utf8");
      expect(await inspectElectronStartup(root, { live: true })).toMatchObject({ required: false });
      expect(await inspectElectronStartup(root)).toMatchObject({ required: true, reason: "startup-incomplete" });
      await expect(ElectronActivationAttempt.begin(root)).rejects.toThrow("explicit exact recovery required");
      expect(await readFile(join(root, "activation.json"), "utf8")).toBe(bytes);
      await activation.commit();
      await activation.stop();
      await ElectronActivationAttempt.begin(root);
      expect(JSON.parse(await readFile(join(root, "activation.json"), "utf8"))).toMatchObject({ state: "starting", previousAttempt: { state: "stopped" } });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
