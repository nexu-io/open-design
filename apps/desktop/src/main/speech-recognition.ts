import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

import type { OpenDesignHostSpeechEvent } from "@open-design/host";

/**
 * Apple-native speech recognition for voice dictation (macOS).
 *
 * The recognition itself lives in the `od-speech` helper (Swift, Apple's Speech
 * framework — see apps/desktop/native/macos/od-speech). This module only spawns
 * it, parses its newline-delimited JSON output and forwards validated events to
 * the renderer. One session at a time.
 */

export const SPEECH_EVENT_CHANNEL = "od:speech:event";

/** Accepts `de`, `pt-BR`, `zh_TW`, `en-US`; nothing that could smuggle an option. */
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,2}$/;
const STOP_KILL_TIMEOUT_MS = 5_000;
const HELPER_ERROR_TAIL = 400;

export type SpeechSpawn = (
  command: string,
  args: readonly string[],
) => ChildProcessWithoutNullStreams;

export type SpeechStartResult = { ok: true } | { ok: false; reason: string };

export function isValidSpeechLocale(value: unknown): value is string {
  return typeof value === "string" && value.length <= 24 && LOCALE_PATTERN.test(value);
}

/** Where the packaged app (or a developer override) keeps the helper binary. */
export function resolveSpeechHelperPath(options: {
  env?: NodeJS.ProcessEnv;
  exists?: (path: string) => boolean;
  platform?: NodeJS.Platform;
  resourcesPath?: string;
} = {}): string | null {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") return null;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const resourcesPath =
    options.resourcesPath ?? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    env.OD_SPEECH_HELPER_BIN,
    env.OD_RESOURCE_ROOT ? join(env.OD_RESOURCE_ROOT, "bin", "od-speech") : undefined,
    resourcesPath ? join(resourcesPath, "open-design", "bin", "od-speech") : undefined,
  ];
  for (const candidate of candidates) {
    if (candidate && exists(candidate)) return candidate;
  }
  return null;
}

/** Parse one helper stdout line; null for anything that is not a known event. */
export function parseSpeechEvent(line: string): OpenDesignHostSpeechEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "ready":
      return typeof record.locale === "string"
        ? { type: "ready", locale: record.locale, onDevice: record.onDevice === true }
        : null;
    case "partial":
    case "final":
      return typeof record.text === "string" ? { type: record.type, text: record.text } : null;
    case "error":
      return typeof record.code === "string"
        ? {
            type: "error",
            code: record.code,
            ...(typeof record.message === "string" ? { message: record.message } : {}),
          }
        : null;
    default:
      return null;
  }
}

export interface SpeechController {
  start(locale: string, onEvent: (event: OpenDesignHostSpeechEvent) => void): SpeechStartResult;
  stop(): void;
  /** Kill any running session (window closed, app quitting). */
  dispose(): void;
  isAvailable(): boolean;
}

export function createSpeechController(options: {
  helperPath?: () => string | null;
  spawnProcess?: SpeechSpawn;
  stopKillTimeoutMs?: number;
} = {}): SpeechController {
  const helperPath = options.helperPath ?? (() => resolveSpeechHelperPath());
  const spawnProcess: SpeechSpawn =
    options.spawnProcess ??
    ((command, args) => spawn(command, [...args], { stdio: ["pipe", "pipe", "pipe"] }));
  const stopKillTimeoutMs = options.stopKillTimeoutMs ?? STOP_KILL_TIMEOUT_MS;
  let child: ChildProcessWithoutNullStreams | null = null;

  function terminate(proc: ChildProcessWithoutNullStreams): void {
    try {
      proc.stdin.write("stop\n");
      proc.stdin.end();
    } catch {
      // stdin already closed
    }
    const timer = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
    }, stopKillTimeoutMs);
    timer.unref?.();
    proc.once("exit", () => clearTimeout(timer));
  }

  return {
    isAvailable: () => helperPath() !== null,

    start(locale, onEvent) {
      if (child) return { ok: false, reason: "speech recognition is already running" };
      if (!isValidSpeechLocale(locale)) return { ok: false, reason: "invalid locale" };
      const bin = helperPath();
      if (bin === null) return { ok: false, reason: "native speech recognition is not available" };

      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawnProcess(bin, ["--locale", locale]);
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
      child = proc;
      let errored = false;
      let stderrTail = "";

      createInterface({ input: proc.stdout }).on("line", (line) => {
        const event = parseSpeechEvent(line);
        if (!event) return;
        if (event.type === "error") errored = true;
        onEvent(event);
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString("utf8")).slice(-HELPER_ERROR_TAIL);
      });
      proc.on("error", (error) => {
        errored = true;
        onEvent({ type: "error", code: "helper-failed", message: error.message });
      });
      proc.on("exit", () => {
        if (child === proc) child = null;
        // A crash before any JSON error (e.g. a privacy-permission abort) would
        // otherwise end silently.
        if (!errored && proc.exitCode !== 0 && proc.signalCode === null) {
          onEvent({ type: "error", code: "helper-failed", message: stderrTail.trim() || undefined });
        }
        onEvent({ type: "ended" });
      });
      return { ok: true };
    },

    stop() {
      if (child) terminate(child);
    },

    dispose() {
      if (child) {
        const proc = child;
        child = null;
        proc.kill("SIGTERM");
      }
    },
  };
}
