import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import type { OpenDesignHostSpeechEvent } from "@open-design/host";
import {
  createSpeechController,
  isValidSpeechLocale,
  parseSpeechEvent,
  resolveSpeechHelperPath,
} from "../../src/main/speech-recognition.js";

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn((signal?: NodeJS.Signals) => {
    this.signalCode = signal ?? "SIGTERM";
    this.emit("exit", null, this.signalCode);
    return true;
  });
  emitLine(value: unknown): void {
    this.stdout.write(`${JSON.stringify(value)}\n`);
  }
  exit(code: number): void {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const child = new FakeChild();
  const spawnProcess = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams);
  const controller = createSpeechController({
    helperPath: () => "/res/open-design/bin/od-speech",
    spawnProcess,
  });
  const events: OpenDesignHostSpeechEvent[] = [];
  return { child, spawnProcess, controller, events, sink: (e: OpenDesignHostSpeechEvent) => events.push(e) };
}

describe("isValidSpeechLocale", () => {
  it("accepts language and language-region tags", () => {
    for (const ok of ["de", "en-US", "pt-BR", "zh_TW", "zh-Hant-TW"]) expect(isValidSpeechLocale(ok)).toBe(true);
  });
  it("rejects anything that could act as an option or path", () => {
    for (const bad of ["", "--help", "de; rm -rf /", "../x", "d", "x".repeat(40), 5, null]) {
      expect(isValidSpeechLocale(bad)).toBe(false);
    }
  });
});

describe("resolveSpeechHelperPath", () => {
  it("is null off macOS", () => {
    expect(resolveSpeechHelperPath({ platform: "win32", exists: () => true })).toBeNull();
  });
  it("prefers the developer override, then the resource root, then the app resources", () => {
    const exists = (p: string) => p.includes("od-speech");
    expect(resolveSpeechHelperPath({ platform: "darwin", env: { OD_SPEECH_HELPER_BIN: "/dev/od-speech" }, exists })).toBe("/dev/od-speech");
    expect(resolveSpeechHelperPath({ platform: "darwin", env: { OD_RESOURCE_ROOT: "/r" }, exists })).toBe("/r/bin/od-speech");
    expect(resolveSpeechHelperPath({ platform: "darwin", env: {}, resourcesPath: "/App/Resources", exists })).toBe("/App/Resources/open-design/bin/od-speech");
  });
  it("is null when the helper is missing", () => {
    expect(resolveSpeechHelperPath({ platform: "darwin", env: {}, resourcesPath: "/x", exists: () => false })).toBeNull();
  });
});

describe("parseSpeechEvent", () => {
  it("parses the helper's event shapes", () => {
    expect(parseSpeechEvent('{"type":"ready","locale":"de-DE","onDevice":true}')).toEqual({ type: "ready", locale: "de-DE", onDevice: true });
    expect(parseSpeechEvent('{"type":"partial","text":"hallo"}')).toEqual({ type: "partial", text: "hallo" });
    expect(parseSpeechEvent('{"type":"final","text":"hallo welt"}')).toEqual({ type: "final", text: "hallo welt" });
    expect(parseSpeechEvent('{"type":"error","code":"mic-denied","message":"no"}')).toEqual({ type: "error", code: "mic-denied", message: "no" });
  });
  it("drops noise and unknown or malformed events", () => {
    for (const line of ["", "not json", "[]", '{"type":"partial"}', '{"type":"nope"}', '{"type":"error"}']) {
      expect(parseSpeechEvent(line)).toBeNull();
    }
  });
});

describe("createSpeechController", () => {
  it("spawns the helper with the locale and forwards parsed events", async () => {
    const { child, spawnProcess, controller, events, sink } = setup();
    expect(controller.start("de", sink)).toEqual({ ok: true });
    expect(spawnProcess).toHaveBeenCalledWith("/res/open-design/bin/od-speech", ["--locale", "de"]);
    child.emitLine({ type: "ready", locale: "de-DE", onDevice: true });
    child.emitLine({ type: "partial", text: "hallo" });
    child.stdout.write("garbage\n");
    await tick();
    expect(events).toEqual([
      { type: "ready", locale: "de-DE", onDevice: true },
      { type: "partial", text: "hallo" },
    ]);
  });

  it("refuses an invalid locale and a second concurrent session", () => {
    const { controller, spawnProcess, sink } = setup();
    expect(controller.start("--bad", sink)).toEqual({ ok: false, reason: "invalid locale" });
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(controller.start("en", sink).ok).toBe(true);
    expect(controller.start("en", sink).ok).toBe(false);
  });

  it("reports unavailability when there is no helper", () => {
    const controller = createSpeechController({ helperPath: () => null });
    expect(controller.isAvailable()).toBe(false);
    expect(controller.start("en", () => undefined).ok).toBe(false);
  });

  it("stop asks the helper to finish; the exit emits `ended` and frees the slot", async () => {
    const { child, controller, events, sink } = setup();
    controller.start("en", sink);
    const written: string[] = [];
    child.stdin.on("data", (c: Buffer) => written.push(c.toString()));
    controller.stop();
    await tick();
    expect(written.join("")).toBe("stop\n");
    child.emitLine({ type: "final", text: "done" });
    await tick();
    child.exit(0);
    expect(events.map((e) => e.type)).toEqual(["final", "ended"]);
    expect(controller.start("en", sink).ok).toBe(true);
  });

  it("turns a crash without a JSON error into a helper-failed error", () => {
    const { child, controller, events, sink } = setup();
    controller.start("en", sink);
    child.exit(134);
    expect(events).toEqual([
      { type: "error", code: "helper-failed", message: undefined },
      { type: "ended" },
    ]);
  });

  it("does not double-report when the helper already sent an error", async () => {
    const { child, controller, events, sink } = setup();
    controller.start("en", sink);
    child.emitLine({ type: "error", code: "speech-denied", message: "x" });
    await tick();
    child.exit(2);
    expect(events.map((e) => e.type)).toEqual(["error", "ended"]);
  });

  it("dispose kills a running session", () => {
    const { child, controller, sink } = setup();
    controller.start("en", sink);
    controller.dispose();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
